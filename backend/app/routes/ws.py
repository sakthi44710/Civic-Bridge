"""
ws.py -- WebSocket endpoint for CivicBridge

Role of this WebSocket:
  1. Receive tool_call messages from ElevenLabs agent (via frontend)
  2. Dispatch to correct backend service (form filling, scheme search, etc.)
  3. Return tool_result back to ElevenLabs agent
  4. Push form_update progress events to frontend
  5. Relay OTP / CAPTCHA answers to the live browser

What this WebSocket does NOT do:
  - Generate AI responses (ElevenLabs main agent owns that)
  - Send screenshots (noVNC port 6080 handles the live visual)
  - Do TTS / speech synthesis
"""

import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any

from ..services.form_agent_service import form_agent_service
from ..services.scheme_service import scheme_service
from ..services.document_service import document_service
from ..utils.auth import decode_token_unsafe
from ..services.dynamodb_service import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket, token: str):
    await websocket.accept()

    user_id = decode_token_unsafe(token)
    if not user_id:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    # Load user profile
    try:
        user = db.get_user(user_id) or {"user_id": user_id}
    except Exception:
        user = {"user_id": user_id}
    session_state: Dict[str, Any] = {
        "user_id": user_id,
        "user_profile": user,
        "conversation_id": None,
        "language": "en",
        "scheme_id": None,
    }

    logger.info(f"[WS] Connected: {user_id}")

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "session_start":
                session_state["language"] = data.get("language", "en")
                session_state["conversation_id"] = data.get("conversation_id")
                await websocket.send_json({
                    "type": "session_started",
                    "conversation_id": session_state["conversation_id"],
                    "novnc_ready": True,
                    # Frontend uses this path to embed noVNC iframe
                    "novnc_path": "/vnc.html?autoconnect=true&resize=scale",
                })

            elif msg_type == "tool_call":
                # ElevenLabs main agent is calling a backend tool
                call_id = data.get("call_id")
                tool = data.get("tool")
                params = data.get("params", {})
                result = await _dispatch_tool(tool, params, session_state, websocket)
                await websocket.send_json({
                    "type": "tool_result",
                    "call_id": call_id,
                    "result": result,
                })

            elif msg_type == "submit_otp":
                # User entered OTP in the modal overlay
                result = await form_agent_service.submit_otp(user_id, data.get("otp", ""))
                await websocket.send_json({"type": "otp_accepted", "success": result.get("success")})

            elif msg_type == "submit_captcha":
                # User typed CAPTCHA answer in the modal overlay
                result = await form_agent_service.submit_captcha(user_id, data.get("text", ""))
                await websocket.send_json({"type": "captcha_accepted", "success": result.get("success")})

            elif msg_type == "voice_transcript":
                # User speech from ElevenLabs -- log only, no backend AI call
                # ElevenLabs handles all conversation intelligence
                logger.debug(f"[WS] User transcript: {data.get('data', '')[:80]}")

            elif msg_type == "assistant_message":
                # ElevenLabs agent reply -- log only
                logger.debug(f"[WS] Agent message: {data.get('data', '')[:80]}")

            elif msg_type == "session_end":
                await form_agent_service.close_session(user_id)
                break

    except WebSocketDisconnect:
        logger.info(f"[WS] Disconnected: {user_id}")
        await form_agent_service.close_session(user_id)
    except Exception as e:
        logger.error(f"[WS] Error {user_id}: {e}")
        await form_agent_service.close_session(user_id)


async def _dispatch_tool(tool: str, params: Dict, session_state: Dict, websocket: WebSocket) -> str:
    """
    Route ElevenLabs tool_call to correct backend service.
    Always returns a plain string -- ElevenLabs agent speaks this to the user.
    """
    user_id = session_state["user_id"]
    profile = session_state["user_profile"]

    try:
        if tool == "search_schemes":
            results = await scheme_service.search_schemes(
                query=params.get("query", ""), category=params.get("category"), state=profile.get("state")
            )
            if not results:
                return "No schemes found."
            return f"Found {len(results)} schemes: {', '.join(s.get('name','') for s in results[:5])}"

        elif tool == "match_schemes":
            results = await scheme_service.match_schemes(profile)
            if not results:
                return "No matching schemes found for your profile."
            return "Top matches: " + "; ".join(
                f"{s.get('name')} ({s.get('match_score',0):.0%} match)" for s in results[:3]
            )

        elif tool == "check_eligibility":
            result = await scheme_service.check_eligibility(profile, params.get("scheme_id"))
            if result.get("eligible"):
                return f"You are eligible. Score: {result.get('match_score',0):.0%}. {result.get('ai_analysis','')}"
            return f"Not eligible. Unmet criteria: {', '.join(result.get('unmet_criteria', []))}"

        elif tool == "start_form_filling":
            scheme_id = params.get("scheme_id")
            scheme = await scheme_service.get_scheme(scheme_id)
            if not scheme:
                return f"Scheme {scheme_id} not found."
            portal_url = scheme.get("portal_url") or scheme.get("application_url")
            if not portal_url:
                return "No portal URL found for this scheme."

            doc_map = await document_service.get_document_map_for_form(user_id)
            user_data = {**profile, **doc_map}

            session = await form_agent_service.start_session(
                user_id=user_id, scheme_id=scheme_id,
                application_id=params.get("application_id", f"app_{user_id}"),
                user_data=user_data, portal_url=portal_url, websocket=websocket,
            )

            # Tell frontend to reveal the noVNC iframe panel
            await websocket.send_json({
                "type": "form_started",
                "scheme_id": scheme_id,
                "session_id": session.session_id,
                "show_novnc": True,
            })

            return (
                f"I've opened the {scheme.get('name')} portal in a live browser. "
                "You can watch me fill the form in real time on your screen. "
                "I'm auto-filling your details now."
            )

        elif tool == "provide_field_data":
            result = await form_agent_service.provide_field(
                user_id, params.get("field_name"), params.get("value")
            )
            if result.get("success"):
                return f"Filled {params.get('field_name')} successfully."
            return f"Could not fill field: {result.get('error')}"

        elif tool == "get_form_status":
            session = form_agent_service.get_session(user_id)
            if not session:
                return "No active form session."
            filled = session.get_filled_fields()
            missing = session.get_missing_fields()
            return (
                f"Progress: {len(filled)}/{session.total_fields} fields filled. "
                f"Filled: {', '.join(filled[:5]) or 'none'}. "
                f"Remaining: {', '.join(missing[:5]) or 'none'}."
            )

        elif tool == "get_missing_fields":
            session = form_agent_service.get_session(user_id)
            if not session:
                return "No active form session."
            missing = session.get_missing_fields()
            return "All fields filled! Ready to submit." if not missing else f"Still need: {', '.join(missing)}"

        elif tool == "stop_form_filling":
            await form_agent_service.close_session(user_id)
            await websocket.send_json({"type": "form_stopped"})
            return "Form filling stopped and browser closed."

        elif tool == "get_user_profile":
            return (
                f"Name: {profile.get('name','N/A')}, Age: {profile.get('age','N/A')}, "
                f"State: {profile.get('state','N/A')}, Income: {profile.get('annual_income','N/A')}"
            )

        elif tool == "get_user_documents":
            docs = await document_service.get_user_documents(user_id)
            if not docs:
                return "No documents uploaded yet."
            return f"Documents: {', '.join(d.get('document_type', d.get('filename','')) for d in docs)}"

        elif tool == "check_documents":
            result = await document_service.check_required_documents(user_id, params.get("scheme_id"))
            if result.get("all_available"):
                return "All required documents are available."
            return f"Missing documents: {', '.join(result.get('missing', []))}"

        else:
            return f"Unknown tool: {tool}"

    except Exception as e:
        logger.error(f"[WS] Tool '{tool}' error: {e}")
        return f"Error running {tool}: {str(e)}"
