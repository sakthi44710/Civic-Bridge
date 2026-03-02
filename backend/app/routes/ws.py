"""
WebSocket Routes - Real-time Bidirectional Voice + Live Form Projection

This WebSocket endpoint handles:
  1. Speech-to-speech streaming via Amazon Nova Sonic
  2. Live form-filling updates from the background agent
  3. Real-time status updates

Protocol (JSON messages over WebSocket):

Frontend → Backend:
  {"type": "session_start", "language": "hi", "conversation_id": "...", "scheme_id": "..."}
  {"type": "audio_chunk", "data": "<base64 PCM 16kHz 16-bit mono>"}
  {"type": "text_message", "data": "user typed text"}
  {"type": "session_end"}

Backend → Frontend:
  {"type": "audio_chunk", "data": "<base64 PCM 24kHz 16-bit mono>"}
  {"type": "transcript", "role": "user|assistant", "text": "..."}
  {"type": "status", "status": "listening|speaking|processing|idle"}
  {"type": "form_update", "data": {...fields, screenshot, progress...}}
  {"type": "session_started", "conversation_id": "...", "nova_sonic": true|false}
  {"type": "error", "message": "..."}
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional

from app.services.nova_sonic_service import nova_sonic_service, NovaSonicSession
from app.services.form_agent_service import form_agent_service, FormFillingSession
from app.services.agent_orchestrator import orchestrator
from app.services.transcribe_service import transcribe_service
from app.services.polly_service import polly_service
from app.services.dynamodb_service import db
from app.services.document_service import document_service
from app.services.translate_service import translate_service
from app.utils.auth import decode_token_unsafe
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


def _authenticate_ws(token: str) -> Optional[str]:
    """Authenticate WebSocket connection from token."""
    if not token:
        return None
    try:
        # Try to decode the token
        user_id = decode_token_unsafe(token)
        return user_id
    except Exception:
        return None


@router.websocket("/ws/voice")
async def voice_websocket(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    """
    Main WebSocket endpoint for real-time voice conversation + live form filling.
    
    Flow:
      1. Client connects with auth token
      2. Client sends session_start with language and optional scheme_id
      3. If Nova Sonic is available:
         - Opens bidirectional stream to Nova Sonic
         - Audio flows directly: client ↔ Nova Sonic
         - Transcripts feed the form agent
      4. If Nova Sonic is NOT available (fallback):
         - Uses existing STT (Transcribe) + Chat (Bedrock) + TTS (Polly)
         - But streams via WebSocket instead of REST for lower perceived latency
      5. Form agent watches conversation → fills Playwright form → sends screenshots
    """
    await websocket.accept()

    # Authenticate
    user_id = _authenticate_ws(token)
    if not user_id:
        # Dev mode: use a default user ID
        user_id = f"dev-ws-{generate_id()[:8]}"
        logger.warning(f"WebSocket: No auth token, using dev user: {user_id}")

    # Session state
    session_state = {
        "user_id": user_id,
        "conversation_id": None,
        "language": "en",
        "scheme_id": None,
        "nova_session": None,
        "form_session": None,
        "conversation_history": [],
        "user_profile": {},
    }

    try:
        # Load user profile
        try:
            session_state["user_profile"] = db.get_user(user_id) or {}
        except Exception:
            pass

        # Load document context for RAG (done once at WS connect)
        try:
            session_state["document_context"] = document_service.get_user_document_context(user_id)
        except Exception:
            session_state["document_context"] = ""

        # Main message loop
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type == "session_start":
                await _handle_session_start(websocket, session_state, msg)

            elif msg_type == "audio_chunk":
                await _handle_audio_chunk(websocket, session_state, msg)

            elif msg_type == "text_message":
                await _handle_text_message(websocket, session_state, msg)

            elif msg_type == "session_end":
                await _handle_session_end(websocket, session_state)
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        await _cleanup_session(session_state)


# ═══════════════════════════════════════════════════════════
# Message Handlers
# ═══════════════════════════════════════════════════════════

async def _handle_session_start(websocket: WebSocket, state: dict, msg: dict):
    """Handle session_start message — initialize Nova Sonic + form agent."""
    state["language"] = msg.get("language", "en")
    state["conversation_id"] = msg.get("conversation_id") or generate_id()
    state["scheme_id"] = msg.get("scheme_id")

    use_nova_sonic = nova_sonic_service.is_available()

    # Load conversation history
    try:
        conv = db.get_conversation(state["user_id"], state["conversation_id"])
        if conv and conv.get("messages"):
            messages = conv["messages"]
            if isinstance(messages, str):
                messages = json.loads(messages)
            state["conversation_history"] = [
                {"role": m.get("role"), "content": m.get("content_en", m.get("content", ""))}
                for m in (messages or [])[-6:]
            ]
    except Exception:
        pass

    if use_nova_sonic:
        # Create Nova Sonic session with transcript callback for form agent
        async def on_transcript(role, text):
            """Called when Nova Sonic produces a transcript."""
            # Feed to form agent
            if state.get("form_session"):
                await state["form_session"].on_conversation_text(role, text)

            # Save to conversation history
            state["conversation_history"].append({"role": role, "content": text})

            # Save to DynamoDB (background)
            asyncio.ensure_future(_save_message(state, role, text))

        nova_session = nova_sonic_service.create_session(
            language=state["language"],
            conversation_history=state["conversation_history"],
            user_profile=state["user_profile"],
            on_transcript=on_transcript,
        )

        success = await nova_session.create()
        if success:
            state["nova_session"] = nova_session

            # Start receiving Nova Sonic output in background
            asyncio.ensure_future(
                _stream_nova_output(websocket, state, nova_session)
            )

            logger.info(f"Nova Sonic session started for {state['user_id']}")
        else:
            use_nova_sonic = False
            logger.warning("Nova Sonic session creation failed, using fallback")

    # Start form agent if scheme is specified
    if state.get("scheme_id"):
        await _start_form_agent(websocket, state)

    # Notify client
    await websocket.send_json({
        "type": "session_started",
        "conversation_id": state["conversation_id"],
        "nova_sonic": use_nova_sonic,
        "form_session": state["form_session"].session_id if state.get("form_session") else None,
    })

    await websocket.send_json({"type": "status", "status": "listening"})


async def _handle_audio_chunk(websocket: WebSocket, state: dict, msg: dict):
    """Handle incoming audio chunk from the client."""
    audio_b64 = msg.get("data", "")
    if not audio_b64:
        return

    nova_session: NovaSonicSession = state.get("nova_session")

    if nova_session:
        # Stream directly to Nova Sonic (speech-to-speech)
        await nova_session.send_audio(audio_b64)
    else:
        # Fallback: collect audio chunks for batch processing
        if "audio_buffer" not in state:
            state["audio_buffer"] = []
        state["audio_buffer"].append(audio_b64)


async def _handle_text_message(websocket: WebSocket, state: dict, msg: dict):
    """Handle text message from the client (typed input)."""
    text = msg.get("data", "").strip()
    if not text:
        return

    await websocket.send_json({"type": "status", "status": "processing"})

    # Send user transcript to frontend
    await websocket.send_json({
        "type": "transcript",
        "role": "user",
        "text": text,
    })

    # Feed to form agent
    if state.get("form_session"):
        await state["form_session"].on_conversation_text("user", text)

    # Process through conversation agent
    try:
        ai_result = await orchestrator.process(
            user_message=text,
            conversation_history=state.get("conversation_history", []),
            user_profile=state.get("user_profile", {}),
            language=state.get("language", "en"),
            conversation_id=state.get("conversation_id"),
            document_context=state.get("document_context", ""),
        )

        ai_response = ai_result.get("message", str(ai_result)) if isinstance(ai_result, dict) else str(ai_result)

        # Send AI transcript
        await websocket.send_json({
            "type": "transcript",
            "role": "assistant",
            "text": ai_response,
        })

        # Feed AI response to form agent
        if state.get("form_session"):
            await state["form_session"].on_conversation_text("assistant", ai_response)

        # Check if we should start form filling
        if isinstance(ai_result, dict):
            intent = ai_result.get("intent", "")
            if intent == "application_start" and not state.get("form_session"):
                schemes = ai_result.get("suggested_schemes", [])
                if schemes:
                    state["scheme_id"] = schemes[0]
                    await _start_form_agent(websocket, state)

            # Send form update if present
            form_update = ai_result.get("form_update")
            if form_update:
                await websocket.send_json({"type": "form_update", "data": form_update})

        # Synthesize speech for the AI response (fallback TTS)
        if not state.get("nova_session"):
            try:
                tts_result = polly_service.synthesize(ai_response, state.get("language", "en"))
                audio_b64 = tts_result.get("audio_base64", "")
                if audio_b64:
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "data": audio_b64,
                        "format": "mp3",
                    })
            except Exception:
                pass

        # Save to history
        state["conversation_history"].append({"role": "user", "content": text})
        state["conversation_history"].append({"role": "assistant", "content": ai_response})
        asyncio.ensure_future(_save_message(state, "user", text))
        asyncio.ensure_future(_save_message(state, "assistant", ai_response))

    except Exception as e:
        logger.error(f"Text message processing error: {e}")
        await websocket.send_json({"type": "error", "message": str(e)})

    await websocket.send_json({"type": "status", "status": "listening"})


async def _handle_session_end(websocket: WebSocket, state: dict):
    """Handle session_end message."""
    await _cleanup_session(state)
    await websocket.send_json({"type": "status", "status": "idle"})
    logger.info(f"Session ended for {state['user_id']}")


# ═══════════════════════════════════════════════════════════
# Nova Sonic Output Stream
# ═══════════════════════════════════════════════════════════

async def _stream_nova_output(websocket: WebSocket, state: dict,
                               nova_session: NovaSonicSession):
    """
    Background task: receive events from Nova Sonic and forward to client.
    This runs for the lifetime of the Nova Sonic session.
    """
    try:
        async for event in nova_session.receive():
            event_type = event.get("type")

            if event_type == "audio":
                # Forward AI audio to client
                await websocket.send_json({
                    "type": "audio_chunk",
                    "data": event["data"],
                    "format": "pcm",
                })

            elif event_type == "transcript":
                # Forward transcript to client
                await websocket.send_json({
                    "type": "transcript",
                    "role": event.get("role", "assistant"),
                    "text": event.get("text", ""),
                })

            elif event_type == "turn_start":
                await websocket.send_json({"type": "status", "status": "speaking"})

            elif event_type == "turn_end":
                await websocket.send_json({"type": "status", "status": "listening"})

            elif event_type == "error":
                await websocket.send_json({
                    "type": "error",
                    "message": event.get("message", "Nova Sonic error"),
                })

    except Exception as e:
        logger.error(f"Nova Sonic output stream error: {e}")


# ═══════════════════════════════════════════════════════════
# Form Agent
# ═══════════════════════════════════════════════════════════

async def _start_form_agent(websocket: WebSocket, state: dict):
    """Start the live form-filling agent."""
    scheme_id = state.get("scheme_id")
    if not scheme_id:
        return

    async def on_form_update(update: dict):
        """Callback: send form updates to the client via WebSocket."""
        try:
            await websocket.send_json(update)
        except Exception:
            pass

    try:
        form_session = await form_agent_service.start_session(
            user_id=state["user_id"],
            scheme_id=scheme_id,
            user_data=state.get("user_profile"),
            on_update=on_form_update,
        )
        state["form_session"] = form_session
        logger.info(f"Form agent started: scheme={scheme_id}, session={form_session.session_id}")
    except Exception as e:
        logger.warning(f"Failed to start form agent: {e}")


# ═══════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════

async def _save_message(state: dict, role: str, text: str):
    """Save a message to DynamoDB (background)."""
    try:
        user_id = state["user_id"]
        conversation_id = state.get("conversation_id")
        if not conversation_id:
            return

        message = {
            "role": role,
            "content": text,
            "content_en": text,  # TODO: translate if needed
            "timestamp": now_iso(),
        }

        conv = db.get_conversation(user_id, conversation_id)
        if conv:
            messages = conv.get("messages", [])
            if isinstance(messages, str):
                messages = json.loads(messages)
            messages.append(message)
            db.update_conversation(user_id, conversation_id, {
                "messages": messages,
                "language": state.get("language", "en"),
            })
        else:
            db.save_conversation({
                "user_id": user_id,
                "conversation_id": conversation_id,
                "messages": [message],
                "language": state.get("language", "en"),
                "created_at": now_iso(),
            })
    except Exception as e:
        logger.warning(f"Failed to save message: {e}")


async def _cleanup_session(state: dict):
    """Clean up all session resources."""
    # Close Nova Sonic
    nova_session = state.get("nova_session")
    if nova_session:
        await nova_session.close()
        state["nova_session"] = None

    # Close form agent
    form_session = state.get("form_session")
    if form_session:
        await form_agent_service.stop_session(form_session.session_id)
        state["form_session"] = None
