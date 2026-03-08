"""
ws.py — WebSocket voice pipeline for CivicBridge

Full pipeline (per voice turn):
  1. Receive binary WebM/Opus audio from frontend
  2. Sarvam saarika:v2 STT  →  text + detected language
  3. Claude Haiku 4.5 (Bedrock) with tool_use loop
       • Calls any of 11 tools if needed (search, form-fill, docs …)
  4. Sarvam bulbul:v2 TTS  →  WAV audio in detected language
  5. Send audio_response + transcript back to frontend

Also handles:
  • text_message  — typed input (skips STT, still uses Claude + TTS)
  • submit_otp / submit_captcha — relay to live Playwright browser
  • session_end — cleanup
"""

import asyncio
import base64
import json as _json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..services.bedrock_service import bedrock_service
from ..services.document_service import document_service
from ..services.dynamodb_service import db
from ..services.form_agent_service import form_agent_service
from ..services.sarvam_service import sarvam_service
from ..services.scheme_service import scheme_service
from ..utils.auth import decode_token_unsafe

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Voice assistant system prompt (Claude Haiku 4.5 — responses are spoken aloud)
# ---------------------------------------------------------------------------

VOICE_SYSTEM_PROMPT = """You are CivicBridge — a friendly multilingual voice AI assistant helping Indian citizens discover and apply for government welfare and scholarship schemes.

CRITICAL LANGUAGE RULE: ALWAYS respond in the EXACT same language the user speaks. Hindi → respond in Hindi. Tamil → Tamil. English → English. Support Hinglish, Tanglish and other code-mixing naturally.

Your tools let you search for schemes, check eligibility, start and monitor live form filling, and manage user documents. Use them proactively when the user asks about schemes or wants to apply.

Voice response guidelines:
- Keep responses SHORT — 1-3 sentences max (you are speaking aloud via TTS)
- Do NOT use markdown, asterisks, bullet symbols, or any formatting characters
- Ask only ONE question at a time
- Be warm, patient, and empathetic — many users have low digital literacy
- When a tool returns results, summarise them conversationally
- When starting form filling, confirm immediately and tell the user to watch the screen"""

# ---------------------------------------------------------------------------
# Tool definitions for Claude Haiku 4.5 (Bedrock Converse toolSpec format)
# ---------------------------------------------------------------------------

CLAUDE_TOOLS: List[Dict] = [
    {
        "toolSpec": {
            "name": "search_schemes",
            "description": "Search for Indian government welfare and scholarship schemes by keyword or category.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search keywords"},
                        "category": {
                            "type": "string",
                            "description": "Category: education, healthcare, agriculture, housing, women, disability, elderly, other",
                        },
                    },
                    "required": ["query"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "match_schemes",
            "description": "Automatically match government schemes to the current user's profile.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "check_eligibility",
            "description": "Check if the user is eligible for a specific government scheme.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "scheme_id": {"type": "string"}
                    },
                    "required": ["scheme_id"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "start_form_filling",
            "description": "Open a live browser and start automatically filling the application form. User can watch in real time.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "scheme_id": {"type": "string"}
                    },
                    "required": ["scheme_id"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "get_form_status",
            "description": "Get current form filling progress.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "get_missing_fields",
            "description": "List the form fields that still need to be filled.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "provide_field_data",
            "description": "Provide a value for a specific form field.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "field_name": {"type": "string"},
                        "value": {"type": "string"},
                    },
                    "required": ["field_name", "value"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "stop_form_filling",
            "description": "Stop the current form filling session and close the browser.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "get_user_profile",
            "description": "Get the user's profile (name, age, state, income, etc.).",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "get_user_documents",
            "description": "List documents the user has uploaded (Aadhaar, PAN, etc.).",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "check_documents",
            "description": "Check which documents are available and which are missing for a scheme.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"scheme_id": {"type": "string"}},
                    "required": ["scheme_id"],
                }
            },
        }
    },
]


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket, token: str):
    await websocket.accept()

    user_id = decode_token_unsafe(token)
    if not user_id:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    try:
        user = db.get_user(user_id) or {"user_id": user_id}
    except Exception:
        user = {"user_id": user_id}

    session_state: Dict[str, Any] = {
        "user_id": user_id,
        "user_profile": user,
        "conversation_id": None,
        "language": "en-IN",
        "conversation_history": [],
    }

    logger.info(f"[WS] Connected: {user_id}")

    try:
        while True:
            msg = await websocket.receive()

            # Binary frame = raw audio from MediaRecorder
            if "bytes" in msg and msg["bytes"]:
                await _handle_audio(msg["bytes"], session_state, websocket)
                continue

            if "text" not in msg:
                continue

            try:
                data = _json.loads(msg["text"])
            except Exception:
                continue

            msg_type = data.get("type")

            if msg_type == "session_start":
                session_state["language"] = data.get("language", "en-IN")
                session_state["conversation_id"] = data.get("conversation_id")
                await websocket.send_json({
                    "type": "session_started",
                    "conversation_id": session_state["conversation_id"],
                    "novnc_ready": True,
                    "novnc_path": "/vnc.html?autoconnect=true&resize=scale",
                })

            elif msg_type == "audio_message":
                # Base64-encoded audio sent as JSON (fallback to binary frames)
                b64 = data.get("data", "")
                if b64:
                    await _handle_audio(base64.b64decode(b64), session_state, websocket)

            elif msg_type == "text_message":
                text = data.get("data", "").strip()
                if text:
                    await _handle_text(text, session_state, websocket)

            elif msg_type == "submit_otp":
                result = await form_agent_service.submit_otp(user_id, data.get("otp", ""))
                await websocket.send_json({"type": "otp_accepted", "success": result.get("success")})

            elif msg_type == "submit_captcha":
                result = await form_agent_service.submit_captcha(user_id, data.get("text", ""))
                await websocket.send_json({"type": "captcha_accepted", "success": result.get("success")})

            elif msg_type == "session_end":
                await form_agent_service.close_session(user_id)
                break

    except WebSocketDisconnect:
        logger.info(f"[WS] Disconnected: {user_id}")
    except Exception as e:
        logger.error(f"[WS] Unhandled error for {user_id}: {e}", exc_info=True)
    finally:
        await form_agent_service.close_session(user_id)


# ---------------------------------------------------------------------------
# Audio handler: Sarvam STT → Claude → Sarvam TTS
# ---------------------------------------------------------------------------


async def _handle_audio(audio_bytes: bytes, session_state: Dict, websocket: WebSocket) -> None:
    """Full voice turn: Sarvam STT → Claude Haiku 4.5 (tool_use) → Sarvam TTS."""
    await websocket.send_json({"type": "status", "status": "processing"})

    hint = session_state.get("language", "en-IN")
    stt = await sarvam_service.speech_to_text(audio_bytes, hint_language=hint)
    user_text = stt.get("text", "").strip()
    language = stt.get("language_code", hint)

    if not user_text:
        await websocket.send_json({"type": "status", "status": "listening"})
        return

    session_state["language"] = language
    await websocket.send_json({"type": "transcript", "role": "user", "text": user_text, "language": language})
    await _process_and_respond(user_text, language, session_state, websocket)


async def _handle_text(text: str, session_state: Dict, websocket: WebSocket) -> None:
    """Typed text input — skip STT, run Claude + TTS."""
    language = session_state.get("language", "en-IN")
    await websocket.send_json({"type": "transcript", "role": "user", "text": text, "language": language})
    await _process_and_respond(text, language, session_state, websocket)


async def _process_and_respond(
    user_text: str, language: str, session_state: Dict, websocket: WebSocket
) -> None:
    """Claude Haiku 4.5 with tool_use → sentence-streaming Sarvam TTS → send audio."""
    response_text = await _run_claude_with_tools(user_text, language, session_state, websocket)

    if not response_text:
        response_text = "Sorry, I could not process that. Please try again."

    await websocket.send_json({"type": "status", "status": "speaking"})
    await websocket.send_json({
        "type": "transcript", "role": "assistant", "text": response_text, "language": language
    })

    # Stream TTS sentence by sentence — first sentence plays ~400ms after Claude responds
    got_audio = False
    async for sentence, wav_bytes in sarvam_service.text_to_speech_sentences(response_text, language):
        await websocket.send_json({
            "type": "audio_response",
            "data": base64.b64encode(wav_bytes).decode("utf-8"),
            "transcript": sentence,
            "language": language,
        })
        got_audio = True

    # Fallback: full TTS if sentence split produced nothing
    if not got_audio:
        audio_bytes = await sarvam_service.text_to_speech(response_text, language)
        if audio_bytes:
            await websocket.send_json({
                "type": "audio_response",
                "data": base64.b64encode(audio_bytes).decode("utf-8"),
                "transcript": response_text,
                "language": language,
            })

    await websocket.send_json({"type": "status", "status": "listening"})


# ---------------------------------------------------------------------------
# Claude Haiku 4.5 tool_use conversation loop
# ---------------------------------------------------------------------------


async def _run_claude_with_tools(
    user_text: str, language: str, session_state: Dict, websocket: WebSocket
) -> str:
    loop = asyncio.get_event_loop()
    history: List[Dict] = session_state.setdefault("conversation_history", [])

    messages = list(history[-20:])
    messages.append({"role": "user", "content": [{"text": user_text}]})

    # Build doc context once per session (cache to avoid repeated DB calls)
    if "_doc_context" not in session_state:
        try:
            ctx = await document_service.get_user_document_context(session_state["user_id"])
            session_state["_doc_context"] = ctx or ""
        except Exception:
            session_state["_doc_context"] = ""
    doc_ctx = session_state["_doc_context"]

    system = (
        VOICE_SYSTEM_PROMPT
        + f"\n\nThe user is currently speaking {language}. You MUST respond in {language}."
    )
    if doc_ctx:
        system += f"\n\nUser documents context:\n{doc_ctx}"

    for _ in range(6):  # max 6 tool-use iterations
        try:
            response = await loop.run_in_executor(
                None,
                lambda: bedrock_service.converse_raw(
                    model_id=settings.BEDROCK_MODEL_ID,
                    messages=messages,
                    system=system,
                    tools=CLAUDE_TOOLS,
                    max_tokens=300,    # Short — voice responses must be concise
                    temperature=0.3,   # Low = fast, consistent
                ),
            )
        except Exception as e:
            logger.error(f"[Claude] converse_raw error: {e}")
            return "I had trouble connecting to the AI. Please try again."

        stop_reason = response.get("stopReason", "end_turn")
        output_content = response.get("output", {}).get("message", {}).get("content", [])

        if stop_reason in ("end_turn", "max_tokens"):
            final_text = " ".join(c.get("text", "") for c in output_content if "text" in c).strip()
            history.append({"role": "user", "content": [{"text": user_text}]})
            history.append({"role": "assistant", "content": output_content})
            if len(history) > 20:
                session_state["conversation_history"] = history[-20:]
            return final_text

        if stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": output_content})
            tool_uses = [c["toolUse"] for c in output_content if "toolUse" in c]
            tool_results = []
            for tu in tool_uses:
                result_text = await _execute_tool(tu["name"], tu.get("input", {}), session_state, websocket)
                tool_results.append({
                    "toolResult": {
                        "toolUseId": tu["toolUseId"],
                        "content": [{"text": result_text}],
                    }
                })
            messages.append({"role": "user", "content": tool_results})
            continue

        break

    return "I encountered an issue. Please try asking again."


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------


async def _execute_tool(tool: str, params: Dict, session_state: Dict, websocket: WebSocket) -> str:
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
                return "No matching schemes found."
            return "Top matches: " + "; ".join(
                f"{s.get('name')} ({int(s.get('match_score',0)*100)}% match)" for s in results[:3]
            )

        elif tool == "check_eligibility":
            result = await scheme_service.check_eligibility(profile, params.get("scheme_id"))
            if result.get("eligible"):
                return f"Eligible. Score: {int(result.get('match_score',0)*100)}%. {result.get('ai_analysis','')}"
            return f"Not eligible. Unmet: {', '.join(result.get('unmet_criteria',[]))}"

        elif tool == "start_form_filling":
            scheme_id = params.get("scheme_id")
            scheme = await scheme_service.get_scheme(scheme_id)
            if not scheme:
                return f"Scheme '{scheme_id}' not found."
            portal_url = scheme.get("portal_url") or scheme.get("application_url")
            if not portal_url:
                return "No portal URL for this scheme."
            doc_map = await document_service.get_document_map_for_form(user_id)
            user_data = {**profile, **doc_map}

            # Fire-and-forget: browser opens in background so Claude responds immediately
            asyncio.create_task(_start_form_background(
                user_id=user_id,
                scheme_id=scheme_id,
                application_id=f"app_{user_id}",
                user_data=user_data,
                portal_url=portal_url,
                websocket=websocket,
            ))
            await websocket.send_json({
                "type": "form_started", "scheme_id": scheme_id,
                "session_id": f"sess_{user_id}_{scheme_id}", "show_novnc": True,
            })
            return f"Opening {scheme.get('name')} in the live browser now. Watch the form being filled on screen."

        elif tool == "get_form_status":
            s = form_agent_service.get_session(user_id)
            if not s:
                return "No active form session."
            filled, missing = s.get_filled_fields(), s.get_missing_fields()
            return f"Progress: {len(filled)}/{s.total_fields} fields. Remaining: {', '.join(missing[:4]) or 'none'}."

        elif tool == "get_missing_fields":
            s = form_agent_service.get_session(user_id)
            if not s:
                return "No active form session."
            missing = s.get_missing_fields()
            return "All done." if not missing else f"Still needed: {', '.join(missing)}"

        elif tool == "provide_field_data":
            result = await form_agent_service.provide_field(user_id, params.get("field_name"), params.get("value"))
            return f"Filled {params.get('field_name')}." if result.get("success") else f"Error: {result.get('error')}"

        elif tool == "stop_form_filling":
            await form_agent_service.close_session(user_id)
            await websocket.send_json({"type": "form_stopped"})
            return "Form session closed."

        elif tool == "get_user_profile":
            return (f"Name: {profile.get('name','N/A')}, Age: {profile.get('age','N/A')}, "
                    f"State: {profile.get('state','N/A')}, Income: {profile.get('annual_income','N/A')}")

        elif tool == "get_user_documents":
            docs = await document_service.get_user_documents(user_id)
            if not docs:
                return "No documents uploaded."
            return "Uploaded: " + ", ".join(d.get("document_type", d.get("filename","?")) for d in docs)

        elif tool == "check_documents":
            result = await document_service.check_required_documents(user_id, params.get("scheme_id"))
            if result.get("all_available"):
                return "All required documents available."
            return f"Missing: {', '.join(result.get('missing',[]))}"

        else:
            return f"Unknown tool: {tool}"

    except Exception as e:
        logger.error(f"[Tool:{tool}] {e}", exc_info=True)
        return f"Error running {tool}: {e}"


# ---------------------------------------------------------------------------
# Background browser launch (non-blocking form start)
# ---------------------------------------------------------------------------


async def _start_form_background(
    user_id: str,
    scheme_id: str,
    application_id: str,
    user_data: dict,
    portal_url: str,
    websocket: WebSocket,
) -> None:
    """Launch browser + start form session in background so Claude responds immediately."""
    try:
        await form_agent_service.start_session(
            user_id=user_id,
            scheme_id=scheme_id,
            application_id=application_id,
            user_data=user_data,
            portal_url=portal_url,
            websocket=websocket,
        )
    except Exception as e:
        logger.error(f"[WS] Form background start error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": f"Could not open browser: {e}"})
        except Exception:
            pass
