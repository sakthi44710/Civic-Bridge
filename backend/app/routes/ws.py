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
import base64
import json
import logging
import re
import struct
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional

from app.services.nova_sonic_service import nova_sonic_service, NovaSonicSession
from app.services.form_agent_service import form_agent_service, FormFillingSession
from app.services.scheme_service import scheme_service
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

            elif msg_type == "voice_transcript":
                # User speech transcript from ElevenLabs — feed to form agent
                # and detect form triggers, but DON'T run backend AI (ElevenLabs handles it)
                await _handle_voice_transcript(websocket, session_state, msg)

            elif msg_type == "assistant_message":
                # ElevenLabs agent response forwarded from frontend — feed to form agent
                # Also check if the AI mentioned form filling (backup trigger)
                assistant_text = str(msg.get("data", "")).strip()
                if assistant_text:
                    form_session = session_state.get("form_session")
                    if form_session:
                        await form_session.on_conversation_text("assistant", assistant_text)
                    # Save to history so form context builds correctly
                    session_state.setdefault("conversation_history", []).append(
                        {"role": "assistant", "content": assistant_text}
                    )

            elif msg_type == "start_form":
                # Client explicitly starts a form session (e.g. user picks a scheme)
                scheme_id = msg.get("scheme_id")
                if scheme_id:
                    session_state["scheme_id"] = scheme_id
                    await _start_form_agent(websocket, session_state)
                    await websocket.send_json({
                        "type": "form_started",
                        "scheme_id": scheme_id,
                        "session_id": session_state["form_session"].session_id if session_state.get("form_session") else None,
                    })

            elif msg_type == "submit_otp":
                # User speaks / types the OTP — relay to live browser
                form_session = session_state.get("form_session")
                if form_session:
                    otp = str(msg.get("otp", "")).strip()
                    await form_session.submit_otp(otp)
                else:
                    await websocket.send_json({"type": "error", "message": "No active form session"})

            elif msg_type == "submit_captcha":
                # User types the CAPTCHA answer — relay to live browser
                form_session = session_state.get("form_session")
                if form_session:
                    captcha_text = str(msg.get("text", "")).strip()
                    await form_session.submit_captcha(captcha_text)
                else:
                    await websocket.send_json({"type": "error", "message": "No active form session"})

            elif msg_type == "tool_call":
                # ElevenLabs client tool → backend action dispatch
                await _handle_tool_call(websocket, session_state, msg)

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
        # Fallback: accumulate PCM chunks, then process after 2.5s of silence
        if "audio_buffer" not in state:
            state["audio_buffer"] = []
        state["audio_buffer"].append(audio_b64)

        # Cancel previous debounce timer and start a fresh one
        prev = state.get("audio_debounce_task")
        if prev and not prev.done():
            prev.cancel()
        state["audio_debounce_task"] = asyncio.ensure_future(
            _process_audio_after_silence(websocket, state)
        )


async def _handle_text_message(websocket: WebSocket, state: dict, msg: dict):
    """Handle text message from the client (typed or speech-recognised input).
    Serialised: if another message is already being processed we buffer this one
    and merge it so the user never gets duplicate parallel responses."""
    text = msg.get("data", "").strip()
    if not text:
        return

    # ── Serialise: only one AI call at a time per session ──────────
    if state.get("_text_processing"):
        # Another request is in-flight — append to pending buffer
        state.setdefault("_text_pending", [])
        state["_text_pending"].append(text)
        logger.debug("Text message queued (AI busy): %s", text[:60])
        return

    state["_text_processing"] = True

    # Merge any previously-queued text that arrived while we were busy
    pending = state.pop("_text_pending", [])
    if pending:
        text = " ".join(pending) + " " + text

    await websocket.send_json({"type": "status", "status": "processing"})

    # Send user transcript to frontend
    await websocket.send_json({
        "type": "transcript",
        "role": "user",
        "text": text,
    })

    # Feed to form agent (background — does not block AI response)
    if state.get("form_session"):
        await state["form_session"].on_conversation_text("user", text)

    # Build form context so the AI knows which fields to ask about
    form_context = _build_form_context(state)

    # Process through conversation agent
    try:
        ai_result = await orchestrator.process(
            user_message=text,
            conversation_history=state.get("conversation_history", []),
            user_profile=state.get("user_profile", {}),
            language=state.get("language", "en"),
            conversation_id=state.get("conversation_id"),
            document_context=state.get("document_context", ""),
            form_context=form_context,
        )

        ai_response = ai_result.get("message", "") if isinstance(ai_result, dict) else str(ai_result)
        if not ai_response or ai_response == str(ai_result):
            # Fallback: use generic acknowledgement instead of raw dict dump
            ai_response = "I'm processing your request. Let me help you with that."
        # Strip any leaked JSON/metadata fragments from the AI response
        ai_response = _strip_json_artifacts(ai_response)

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
        if not state.get("form_session"):
            should_start, scheme_id = _should_start_form(text, ai_result, state)
            if should_start:
                state["scheme_id"] = scheme_id
                await _start_form_agent(websocket, state)
                await websocket.send_json({
                    "type": "form_started",
                    "scheme_id": scheme_id,
                    "session_id": state["form_session"].session_id if state.get("form_session") else None,
                })

            # Send form update if present
            form_update = ai_result.get("form_update")
            if form_update:
                await websocket.send_json({"type": "form_update", "data": form_update})

        # Synthesize speech for the AI response (fallback TTS)
        if not state.get("nova_session"):
            try:
                spoken = _make_tts_text(ai_response)
                if spoken:
                    tts_result = polly_service.synthesize(spoken, state.get("language", "en"))
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

        # Drain any text that queued up while we were processing
        _drain = state.pop("_text_pending", [])
        state["_text_processing"] = False
        if _drain:
            merged = " ".join(_drain)
            asyncio.ensure_future(
                _handle_text_message(websocket, state, {"data": merged})
            )

    except Exception as e:
        logger.error(f"Text message processing error: {e}")
        state["_text_processing"] = False
        state.pop("_text_pending", None)
        await websocket.send_json({"type": "error", "message": str(e)})

    await websocket.send_json({"type": "status", "status": "listening"})


# ═════════════════════════════════════════════════════════
# Tool Call Handler  (ElevenLabs client tools → backend actions)
# ═════════════════════════════════════════════════════════

async def _handle_tool_call(websocket: WebSocket, state: dict, msg: dict):
    """
    Dispatch an ElevenLabs client tool call to the appropriate backend service.
    
    Protocol:
        Frontend sends:  { type: "tool_call", call_id: "...", tool: "search_schemes", params: {...} }
        Backend replies:  { type: "tool_result", call_id: "...", result: "readable string" }
    
    The result string is returned to the ElevenLabs agent so it can speak
    the answer back to the user.
    """
    call_id = msg.get("call_id", "")
    tool = msg.get("tool", "")
    params = msg.get("params", {})

    logger.info(f"Tool call: {tool} (call_id={call_id}) params={params}")

    try:
        result = await _dispatch_tool(tool, params, state, websocket)
    except Exception as e:
        logger.error(f"Tool call error ({tool}): {e}")
        result = f"Sorry, there was an error processing that request: {str(e)}"

    await websocket.send_json({
        "type": "tool_result",
        "call_id": call_id,
        "result": result,
    })


async def _dispatch_tool(tool: str, params: dict, state: dict,
                          websocket: WebSocket) -> str:
    """Route a tool call to the correct service and return a speakable result."""
    loop = asyncio.get_event_loop()

    # ── search_schemes ──────────────────────────────────────
    if tool == "search_schemes":
        query = params.get("query", "")
        category = params.get("category", "")
        user_state = (state.get("user_profile") or {}).get("state", "")
        schemes = await loop.run_in_executor(
            None,
            lambda: scheme_service.search_schemes(
                query=query or None, category=category or None, state=user_state or None
            ),
        )
        if not schemes:
            return "I couldn't find any schemes matching your search. Try different keywords or a broader category."
        # Limit to top 5 for spoken response
        top = schemes[:5]
        lines = [f"I found {len(schemes)} scheme{'s' if len(schemes) != 1 else ''}. Here are the top results:"]
        for i, s in enumerate(top, 1):
            name = s.get("name", "Unknown")
            desc = (s.get("description") or "")[:120]
            benefit = s.get("benefit_amount") or s.get("benefit_description") or ""
            line = f"{i}. {name}"
            if benefit:
                line += f" — benefit: {benefit}"
            if desc:
                line += f". {desc}"
            lines.append(line)
        if len(schemes) > 5:
            lines.append(f"...and {len(schemes) - 5} more. Would you like me to narrow the search?")
        return "\n".join(lines)

    # ── check_eligibility ───────────────────────────────────
    elif tool == "check_eligibility":
        scheme_id = params.get("scheme_id", "")
        if not scheme_id:
            return "Please specify which scheme you'd like me to check your eligibility for."
        user_profile = state.get("user_profile") or {}
        result = await loop.run_in_executor(
            None,
            lambda: scheme_service.check_eligibility(user_profile, scheme_id),
        )
        if result.get("error"):
            return f"I couldn't find that scheme. {result['error']}"
        status = result.get("status", "unknown")
        score = result.get("match_score", 0)
        met = result.get("met_criteria", [])
        unmet = result.get("unmet_criteria", [])
        missing = result.get("missing_info", [])
        parts = [f"Eligibility check result: {status} (match score {score}%)."]
        if met:
            parts.append(f"Criteria met: {', '.join(met)}.")
        if unmet:
            parts.append(f"Criteria not met: {', '.join(unmet)}.")
        if missing:
            parts.append(f"Missing information: {', '.join(missing)}. Please update your profile.")
        # Include AI analysis if available
        ai = result.get("ai_analysis")
        if isinstance(ai, dict) and ai.get("summary"):
            parts.append(ai["summary"])
        return " ".join(parts)

    # ── start_form_filling ──────────────────────────────────
    elif tool == "start_form_filling":
        scheme_id = params.get("scheme_id", "")
        if not scheme_id:
            return "Please tell me which scheme form you'd like me to fill."
        # Check if a form session is already running
        if state.get("form_session"):
            return "A form filling session is already in progress. You can ask me for the form status or wait for it to complete."
        state["scheme_id"] = scheme_id
        await _start_form_agent(websocket, state)
        if state.get("form_session"):
            return f"I've started filling the form for scheme {scheme_id}. You'll see the live browser on your screen. I'll let you know when I need any input from you."
        else:
            return f"I wasn't able to start the form for scheme {scheme_id}. The scheme portal might be unavailable."

    # ── get_form_status ─────────────────────────────────────
    elif tool == "get_form_status":
        form_session = state.get("form_session")
        if not form_session:
            return "There's no active form filling session right now. Would you like me to start one?"
        try:
            filled = form_session.filled_fields if hasattr(form_session, 'filled_fields') else {}
            missing = form_session.missing_fields if hasattr(form_session, 'missing_fields') else []
            status = form_session.status if hasattr(form_session, 'status') else "in_progress"
            filled_count = len(filled) if isinstance(filled, dict) else 0
            total = filled_count + (len(missing) if isinstance(missing, list) else 0)
            parts = [f"Form status: {status}."]
            if total > 0:
                parts.append(f"{filled_count} of {total} fields filled.")
            if missing:
                parts.append(f"Still needed: {', '.join(missing[:5])}.")
                if len(missing) > 5:
                    parts.append(f"...and {len(missing) - 5} more fields.")
            return " ".join(parts)
        except Exception as e:
            return f"Form is in progress. {str(e)}"

    # ── get_user_profile ────────────────────────────────────
    elif tool == "get_user_profile":
        profile = state.get("user_profile") or {}
        if not profile:
            return "I don't have your profile information yet. Please complete your profile in the app settings."
        parts = ["Here's a summary of your profile:"]
        field_labels = {
            "full_name": "Name", "name": "Name",
            "dob": "Date of Birth", "date_of_birth": "Date of Birth",
            "gender": "Gender",
            "state": "State", "district": "District", "city": "City",
            "annual_income": "Annual Income", "income": "Income",
            "occupation": "Occupation", "category": "Category",
            "education": "Education", "email": "Email", "phone": "Phone",
            "aadhaar_number": "Aadhaar", "pan_number": "PAN",
        }
        for key, label in field_labels.items():
            val = profile.get(key)
            if val:
                parts.append(f"{label}: {val}")
        return ". ".join(parts) + "." if len(parts) > 1 else "Your profile has limited information. Please update it."

    # ── get_user_documents ──────────────────────────────────
    elif tool == "get_user_documents":
        user_id = state.get("user_id", "")
        if not user_id:
            return "User not identified. Please log in."
        try:
            docs = await loop.run_in_executor(
                None, lambda: document_service.get_user_documents(user_id)
            )
        except Exception:
            docs = []
        if not docs:
            return "You haven't uploaded any documents yet. You can upload documents like Aadhaar card, PAN card, income certificate etc. from the Documents section."
        parts = [f"You have {len(docs)} document{'s' if len(docs) != 1 else ''} uploaded:"]
        for d in docs[:8]:
            doc_type = d.get("document_type", "unknown")
            name = d.get("ai_generated_name") or d.get("original_filename") or doc_type
            parts.append(f"- {name} ({doc_type})")
        if len(docs) > 8:
            parts.append(f"...and {len(docs) - 8} more.")
        return "\n".join(parts)

    # ── check_documents ─────────────────────────────────────
    elif tool == "check_documents":
        scheme_id = params.get("scheme_id", "")
        if not scheme_id:
            return "Please specify which scheme you'd like me to check documents for."
        user_id = state.get("user_id", "")
        # Get scheme to find required documents
        scheme = await loop.run_in_executor(
            None, lambda: scheme_service.get_scheme(scheme_id)
        )
        if not scheme:
            return f"I couldn't find scheme {scheme_id}."
        required = scheme.get("required_documents") or scheme.get("documents_required") or []
        if not required:
            return f"The scheme {scheme.get('name', scheme_id)} doesn't list specific document requirements."
        try:
            check = await loop.run_in_executor(
                None, lambda: document_service.check_required_documents(user_id, required)
            )
        except Exception as e:
            return f"Error checking documents: {str(e)}"
        available = check.get("available", [])
        missing = check.get("missing", [])
        parts = [f"Document check for {scheme.get('name', scheme_id)}:"]
        parts.append(f"{len(available)} of {check.get('total_required', 0)} required documents available.")
        if available:
            parts.append(f"You have: {', '.join(available)}.")
        if missing:
            parts.append(f"Missing: {', '.join(missing)}. Please upload these documents.")
        else:
            parts.append("You have all required documents!")
        return " ".join(parts)

    else:
        return f"Unknown tool: {tool}. I can help with searching schemes, checking eligibility, filling forms, or managing documents."


async def _handle_voice_transcript(websocket: WebSocket, state: dict, msg: dict):
    """Handle transcripts from ElevenLabs voice AI.
    Unlike _handle_text_message, this does NOT run the backend AI pipeline.
    It only:
      1. Feeds the transcript to the form agent (for field extraction)
      2. Checks for form-start triggers (regex/keyword detection)
      3. Saves to conversation history
    """
    text = str(msg.get("data", "")).strip()
    if not text:
        return

    # Feed to form agent (background)
    form_session = state.get("form_session")
    if form_session:
        await form_session.on_conversation_text("user", text)

    # Check for form trigger — start form agent if not already running
    if not form_session:
        should_start, scheme_id = _should_start_form(text, {}, state)
        if should_start:
            state["scheme_id"] = scheme_id
            await _start_form_agent(websocket, state)
            await websocket.send_json({
                "type": "form_started",
                "scheme_id": scheme_id,
                "session_id": state["form_session"].session_id
                    if state.get("form_session") else None,
            })

    # Save to history
    state.setdefault("conversation_history", []).append(
        {"role": "user", "content": text}
    )
    asyncio.ensure_future(_save_message(state, "user", text))


async def _handle_session_end(websocket: WebSocket, state: dict):
    """Handle session_end message."""
    await _cleanup_session(state)
    await websocket.send_json({"type": "status", "status": "idle"})
    logger.info(f"Session ended for {state['user_id']}")


# ═════════════════════════════════════════════════════════
# Fallback Audio Pipeline  (STT → Bedrock → Polly)
# ═════════════════════════════════════════════════════════

async def _process_audio_after_silence(websocket: WebSocket, state: dict,
                                        silence_s: float = 2.2):
    """
    Debounced fallback: waits for silence_s seconds after the last audio chunk,
    then runs the full STT → AI → TTS pipeline.
    """
    try:
        await asyncio.sleep(silence_s)

        buffer: list = state.pop("audio_buffer", [])
        if not buffer:
            return

        # Need at least ~0.3s of audio (0.3 * 16000 Hz * 2 bytes = 9600 bytes)
        try:
            total_pcm = b"".join(base64.b64decode(c) for c in buffer)
        except Exception:
            return
        if len(total_pcm) < 9600:
            await websocket.send_json({"type": "status", "status": "listening"})
            return

        await websocket.send_json({"type": "status", "status": "processing"})

        # ── 1. STT via Transcribe ────────────────────────
        text = ""
        try:
            wav_bytes = _pcm16_to_wav(total_pcm)
            stt_result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: transcribe_service.transcribe_audio(
                    wav_bytes, state.get("language", "en"), "wav"
                )
            )
            text = (stt_result.get("text") or stt_result.get("transcript") or "").strip()
        except Exception as e:
            logger.warning(f"STT error: {e}")

        if not text:
            await websocket.send_json({"type": "status", "status": "listening"})
            return

        # ── 2. Send user transcript ─────────────────────
        await websocket.send_json({"type": "transcript", "role": "user", "text": text})
        if state.get("form_session"):
            await state["form_session"].on_conversation_text("user", text)

        # ── 3. AI response via Bedrock ─────────────────
        form_context = _build_form_context(state)
        try:
            ai_result = await orchestrator.process(
                user_message=text,
                conversation_history=state.get("conversation_history", []),
                user_profile=state.get("user_profile", {}),
                language=state.get("language", "en"),
                conversation_id=state.get("conversation_id"),
                document_context=state.get("document_context", ""),
                form_context=form_context,
            )
            ai_response = ai_result.get("message", "") if isinstance(ai_result, dict) else str(ai_result)
            if not ai_response:
                ai_response = "I'm processing your request. Let me help you with that."
            ai_response = _strip_json_artifacts(ai_response)
        except Exception as e:
            logger.error(f"AI error in audio fallback: {e}")
            ai_response = "Sorry, I couldn't process that. Please try again."

        # ── 4. Send AI transcript + feed form agent ───
        await websocket.send_json({"type": "status", "status": "speaking"})
        await websocket.send_json({"type": "transcript", "role": "assistant", "text": ai_response})
        if state.get("form_session"):
            await state["form_session"].on_conversation_text("assistant", ai_response)

        # Auto-start form agent when schemes are suggested
        if not state.get("form_session"):
            should_start, scheme_id = _should_start_form(text, ai_result, state)
            if should_start:
                state["scheme_id"] = scheme_id
                await _start_form_agent(websocket, state)
                await websocket.send_json({
                    "type": "form_started",
                    "scheme_id": scheme_id,
                    "session_id": state["form_session"].session_id if state.get("form_session") else None,
                })

        # ── 5. TTS via Polly (clean spoken text only) ──
        try:
            spoken = _make_tts_text(ai_response)
            if spoken:
                tts = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: polly_service.synthesize(spoken, state.get("language", "en"))
                )
                audio_out = tts.get("audio_base64", "")
                if audio_out:
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "data": audio_out,
                        "format": "mp3",
                    })
        except Exception as e:
            logger.warning(f"TTS error: {e}")

        # ── 6. Save conversation ──────────────────────
        state["conversation_history"].append({"role": "user", "content": text})
        state["conversation_history"].append({"role": "assistant", "content": ai_response})
        asyncio.ensure_future(_save_message(state, "user", text))
        asyncio.ensure_future(_save_message(state, "assistant", ai_response))

        await websocket.send_json({"type": "status", "status": "listening"})

    except asyncio.CancelledError:
        pass  # More audio arrived — debounce reset, that's expected
    except Exception as e:
        logger.error(f"Audio fallback pipeline error: {e}")
        try:
            await websocket.send_json({"type": "status", "status": "listening"})
        except Exception:
            pass


def _make_tts_text(message: str, max_sentences: int = 2) -> str:
    """
    Convert an AI markdown message to a short spoken summary.

    Strategy (voice-friendly):
      1. Extract **bold / highlighted** key phrases
      2. Extract concise bullet / numbered-list items
      3. Fall back to the first 2 sentences if neither exist
    This keeps speech short so the assistant speaks only the key points.
    """
    if not message:
        return ""

    # ── 0. Strip leaked metadata ─────────────────────
    text = message
    text = re.sub(r'\*{0,2}(Suggested Actions|Suggested Schemes|Intent|Detected Language|Requires Info)\*{0,2}\s*[:\[].*', '', text, flags=re.DOTALL)
    text = re.sub(r'\[\{"type".*?\}\]', '', text, flags=re.DOTALL)

    # ── 1. Collect highlighted / bold phrases ────────
    bold_phrases = re.findall(r'\*{2,3}([^*]{3,})\*{2,3}', text)
    bold_phrases = [p.strip().rstrip(':').rstrip('.') for p in bold_phrases if len(p.strip()) > 2]

    # ── 2. Collect bullet / numbered-list items (first 4) ────
    bullet_items = re.findall(r'^\s*(?:[-*•]|\d+[.)])\s+(.+)', text, re.MULTILINE)
    bullet_items = [b.strip() for b in bullet_items if len(b.strip()) > 3][:4]

    # ── 3. Build spoken text ─────────────────────────
    # Strip all markdown for the plain version
    plain = text
    plain = re.sub(r'^#+\s+', '', plain, flags=re.MULTILINE)
    plain = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', plain)
    plain = re.sub(r'`[^`]*`', '', plain)
    plain = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', plain)
    plain = re.sub(r'^[-*>|] *', '', plain, flags=re.MULTILINE)
    plain = re.sub(r'^\d+\.\s+', '', plain, flags=re.MULTILINE)
    plain = re.sub(r'\n+', ' ', plain)
    plain = re.sub(r'\s{2,}', ' ', plain).strip()

    # First sentence is the intro / direct answer
    sentence_end = re.compile(r'(?<=[.!?])\s+')
    sentences = [s.strip() for s in sentence_end.split(plain) if s.strip()]
    intro = sentences[0] if sentences else plain[:200]

    if bullet_items:
        # Speak the intro + up to 4 bullet points
        points = ', '.join(bullet_items[:4])
        spoken = f"{intro}. Key points: {points}."
    elif bold_phrases:
        # Speak the intro + bold highlights
        highlights = ', '.join(bold_phrases[:4])
        spoken = f"{intro}. Highlights: {highlights}."
    else:
        # No structure — just the first 2 sentences
        spoken = ' '.join(sentences[:max_sentences])

    # Hard cap at ~400 chars so Polly is fast
    if len(spoken) > 400:
        spoken = spoken[:397].rsplit(' ', 1)[0] + '...'
    return spoken


def _pcm16_to_wav(pcm_bytes: bytes, sample_rate: int = 16000,
                  channels: int = 1, bits: int = 16) -> bytes:
    """Wrap raw 16-bit PCM bytes in a minimal WAV container."""
    data_size = len(pcm_bytes)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1,          # PCM format
        channels, sample_rate,
        sample_rate * channels * bits // 8,
        channels * bits // 8, bits,
        b'data', data_size,
    )
    return header + pcm_bytes


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

def _build_form_context(state: dict) -> str:
    """Build a context string telling the AI about form-filling status.
    This lets the conversational AI naturally ask the user for missing fields
    without the AI itself doing the filling — the separate form agent fills."""
    form_session: FormFillingSession = state.get("form_session")
    if not form_session or not form_session._running:
        return ""

    missing = form_session.get_missing_fields()
    filled = form_session.get_filled_fields()

    if not missing:
        return (
            "[FORM STATUS: A background agent is filling the application form. "
            "All fields are complete! Let the user know the form is ready for review/submission.]"
        )

    parts = [
        "[FORM STATUS: A separate form-filling agent is filling the application form "
        "in real-time based on this conversation. You do NOT fill the form yourself — "
        "just have a natural conversation and ask the user for the information below.",
    ]
    if filled:
        parts.append(f"Already filled: {', '.join(filled)}.")
    parts.append(f"Still needed: {', '.join(missing)}.")
    parts.append(
        "Ask for 1-2 missing fields at a time in a conversational, friendly way. "
        "Do NOT list all fields at once. The form agent will pick up the data automatically.]"
    )
    return " ".join(parts)


def _strip_json_artifacts(text: str) -> str:
    """Remove leaked JSON metadata from AI response text before sending to frontend."""
    clean = text.strip()
    # Remove trailing JSON object { ... }
    depth = 0
    json_start = -1
    json_end = -1
    for i in range(len(clean) - 1, -1, -1):
        c = clean[i]
        if c == '}':
            if depth == 0:
                json_end = i + 1
            depth += 1
        elif c == '{':
            depth -= 1
            if depth == 0:
                json_start = i
                break
    if json_start > 0 and json_end > json_start:
        before = clean[:json_start].strip()
        if len(before) > 10:
            clean = before
    # Strip raw JSON key-value pairs that leak without braces
    clean = re.sub(
        r'["\']\s*(?:intent|detected_language|suggested_schemes|suggested_actions|requires_info)\s*["\']\s*:\s*[^,}\]]*[,]?\s*',
        '', clean, flags=re.IGNORECASE
    )
    # Remove orphaned braces/brackets
    clean = re.sub(r'[{}\[\]]\s*$', '', clean)
    # Collapse blank lines
    clean = re.sub(r'\n{3,}', '\n\n', clean)
    return clean.strip()


# Patterns that indicate the user wants to start filling a form
_FORM_START_PATTERNS = re.compile(
    r'(?:fill|filling|start|begin|open|launch)\s+(?:\w+\s+){0,4}(?:form|application|portal)|'
    r'(?:form|application)\s+(?:\w+\s+){0,3}(?:fill|filling|start|begin|open)|'
    r'(?:apply|register)\s*(?:now|for|online)|'
    r'(?:i\s+want\s+to\s+(?:apply|fill))|'
    r'(?:help\s+me\s+(?:fill|apply))|'
    r'(?:start\s+(?:my\s+)?(?:application|filling))|'
    r'(?:form\s+(?:bhar|bharo|shuru|bharein|bharna))|'  # Hindi
    r'(?:(?:bhar|bharo|shuru)\s+(?:karo|kijiye|kare))|'  # Hindi verb forms
    r'(?:form\s+nirappu|nirappu|nirapungal)|'  # Tamil
    r'(?:apply\s+(?:cheyyi|cheyyandi))|'  # Telugu
    r'(?:form\s+(?:puran|purun|pora|bharun))',  # Bengali/Marathi
    re.IGNORECASE,
)

# Keyword sets for broad form-start detection
_FORM_ACTION_WORDS = frozenset({
    'fill', 'filling', 'start', 'begin', 'open', 'launch', 'apply',
    'submit', 'complete', 'register', 'commence', 'initiate',
    'bhar', 'bharo', 'shuru', 'nirappu', 'puran', 'pora',
})
_FORM_TARGET_WORDS = frozenset({
    'form', 'application', 'portal', 'registration', 'enrollment',
    'apply', 'register', 'scholarship', 'scheme',
})


def _should_start_form(user_text: str, ai_result, state: dict) -> tuple:
    """Decide whether to auto-start the form agent.
    Returns (should_start: bool, scheme_id: str)."""
    scheme_id = state.get("scheme_id")

    # Collect scheme from AI result
    ai_schemes = []
    ai_intent = ""
    if isinstance(ai_result, dict):
        ai_intent = ai_result.get("intent", "")
        ai_schemes = ai_result.get("suggested_schemes", [])

    # Helper: resolve the best scheme_id from all sources
    def _resolve_scheme():
        if ai_schemes:
            return ai_schemes[0]
        if scheme_id:
            return scheme_id
        # Try to extract scheme from conversation history
        history = state.get("conversation_history", [])
        for msg in reversed(history[-10:]):
            content = msg.get("content", "").lower()
            # Look for common scheme references in recent messages
            for pattern in ["nsp", "scholarship", "pm-kisan", "ayushman", "pmjay",
                            "nrega", "mgnrega", "vidyalakshmi", "pm-jay",
                            "pension", "obc", "sc/st", "education"]:
                if pattern in content:
                    return pattern.replace("/", "_") + "_scheme"
        return "generic_application"

    # 1. AI returned application_start intent (with or without schemes)
    if ai_intent in ("application_start", "application_help"):
        return True, _resolve_scheme()

    # 2. AI returned a matching scheme inquiry intent WITH specific schemes
    if ai_schemes and ai_intent in ("scheme_inquiry", "eligibility_check"):
        return True, ai_schemes[0]

    # 3. User explicitly asked to fill a form (regex match)
    if _FORM_START_PATTERNS.search(user_text):
        return True, _resolve_scheme()

    # 4. Broad keyword intersection — catches natural phrasing in any order
    words = set(user_text.lower().split())
    if words & _FORM_ACTION_WORDS and words & _FORM_TARGET_WORDS:
        return True, _resolve_scheme()

    # 5. Try to salvage intent from raw AI text (model sometimes leaks JSON metadata)
    if isinstance(ai_result, dict):
        raw_msg = str(ai_result.get("message", ""))
        if '"application_start"' in raw_msg or '"application_help"' in raw_msg:
            return True, _resolve_scheme()

    return False, ""


async def _start_form_agent(websocket: WebSocket, state: dict):
    """Start the live form-filling agent."""
    scheme_id = state.get("scheme_id")
    if not scheme_id:
        return

    async def on_form_update(update: dict):
        """Callback: send form updates to the client via WebSocket.
        Also sends a spoken voice notification when OTP or CAPTCHA is needed."""
        try:
            await websocket.send_json(update)

            # Voice notification for OTP / CAPTCHA — text + TTS audio
            data = update.get("data", {})
            status = data.get("status", "")
            spoken_text = None
            if status == "waiting_otp":
                spoken_text = ("An OTP has been sent to your registered mobile number. "
                               "Please check your phone and enter the OTP when you receive it.")
            elif status == "waiting_captcha":
                spoken_text = ("There is a CAPTCHA on the form that I cannot solve automatically. "
                               "Please look at the screen and enter the CAPTCHA text.")

            if spoken_text:
                # Send as transcript for display
                await websocket.send_json({
                    "type": "transcript", "role": "assistant", "text": spoken_text,
                })
                # Also synthesize TTS so the user hears it
                try:
                    tts_result = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: polly_service.synthesize(spoken_text, state.get("language", "en")),
                    )
                    audio_b64 = tts_result.get("audio_base64", "")
                    if audio_b64:
                        await websocket.send_json({
                            "type": "audio_chunk", "data": audio_b64, "format": "mp3",
                        })
                except Exception:
                    pass
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
    # Cancel any pending audio debounce task
    debounce = state.get("audio_debounce_task")
    if debounce and not debounce.done():
        debounce.cancel()

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
