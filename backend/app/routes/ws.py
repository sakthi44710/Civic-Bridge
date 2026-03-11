"""
ws.py — WebSocket voice pipeline for CivicBridge

Full pipeline (per voice turn):
  1. Receive binary WebM/Opus audio from frontend
  2. Sarvam saarika:v2 STT  →  text + detected language
  3. Mistral Large 3 (Bedrock Converse) with tool_use loop
       • Calls any of 11 tools if needed (search, form-fill, docs …)
  4. Sarvam bulbul:v2 TTS  →  WAV audio in detected language
  5. Send audio_response + transcript back to frontend

Also handles:
  • text_message  — typed input (skips STT, still uses Mistral + TTS)
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
from ..services.web_search_service import web_search_service
from ..utils.auth import decode_token_unsafe
from ..utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Voice assistant system prompt (Mistral Large 3 — responses are spoken aloud)
# ---------------------------------------------------------------------------

VOICE_SYSTEM_PROMPT = """You are CivicBridge — a friendly multilingual voice AI assistant helping Indian citizens discover and apply for government welfare schemes, private scholarships, NGO programmes, and corporate CSR initiatives — ANY scheme, not just government.

CRITICAL LANGUAGE RULE: ALWAYS respond in the EXACT same language the user speaks. Hindi → respond in Hindi. Tamil → Tamil. English → English. Support Hinglish, Tanglish and other code-mixing naturally.

Your tools let you search for schemes, check eligibility, start and monitor live form filling, and manage user documents. Use them proactively when the user asks about schemes or wants to apply.

DATA VERIFICATION (VERY IMPORTANT):
- When the user asks about their details, documents, or profile, call get_verified_user_data. This returns ONE consolidated view merging profile data + all document extractions. Each field shows the single best value AND flags conflicts (e.g. profile says "Rahul" but Aadhaar says "Rahul Kumar").
- Present the consolidated data to the user field by field. For any conflict, ask which value is correct.
- When the user confirms or corrects a value, call update_user_data with the field name and correct value. This updates BOTH the profile AND all relevant document records automatically — so there is always ONE consistent value everywhere.
- There is only ONE name, ONE address, ONE DOB, etc. in the system. Never present duplicate values — always show the merged result and resolve conflicts.
- Example: "Your name is Sakthiprakash T and your address is 27 Middle Street, Kombakkam. Is that correct?" If user says the address is different, call update_user_data to fix it everywhere.
- After verification, tell the user their data is now confirmed and ready for form filling.

FORM FILLING & BROWSER AUTOMATION (CRITICAL):
- When the user asks to fill a form, apply for a scheme, or visit any website:
  1. Call web_search to find the correct official URL for the scheme
  2. Call start_form_filling with the portal_url (or scheme_id for known schemes)
  3. That is ALL you need to do initially. An autonomous browser agent takes over and handles navigation, clicking, typing, scrolling, and form submission automatically.
- The user does NOT need to give any directions. The browser agent works completely on its own.
- NEVER refuse because a scheme is "private" or "not government". ALWAYS try.
- After calling start_form_filling, tell the user: "I am opening the form now and will fill it automatically. Just sit back and watch the screen."
- For schemes in our database: call start_form_filling with scheme_id.
- For PRIVATE schemes NOT in our database: call web_search first to find the URL, then call start_form_filling with portal_url.
- If the agent encounters an OTP or CAPTCHA, the user will be prompted automatically.

USER-DIRECTED BROWSER CONTROL (IMPORTANT):
- If the user gives you a SPECIFIC browser instruction like "click Next", "scroll down", "type my name", "go back", "click the checkbox", "select option X", "press Enter", etc. — you MUST execute it using the browser tools (browser_click, browser_type, browser_scroll, browser_navigate, browser_read_screen, browser_select_option, browser_press_key, browser_back).
- NEVER refuse to control the browser when the user explicitly asks. You have FULL access to the live browser at all times.
- If unsure what to click or type, call browser_read_screen first to see the current page, then execute the user's request.
- The user's voice/text commands override the autonomous agent — if the user says "click Next" or "fill my father name as Rajan", do it immediately.

Voice response guidelines:
- Keep responses SHORT — 1-3 sentences max (you are speaking aloud via TTS)
- Do NOT use markdown formatting — no asterisks, bullets, dashes, or hashtags. Speak naturally.
- Ask only ONE question at a time
- Be warm, patient, and confident — many users have low digital literacy
- When a tool returns results, summarise them conversationally
- When starting form filling, confirm immediately and tell the user to watch the screen
- NEVER apologise or say you are having technical issues unless the user explicitly reports a problem
- If a tool returns an error or no results, try an alternative approach or ask the user for more details. Do NOT say sorry or mention internal errors.
- Be direct and helpful — give the user clear next steps"""

# ---------------------------------------------------------------------------
# Autonomous browser agent system prompt (runs as background task)
# ---------------------------------------------------------------------------

AUTONOMOUS_AGENT_PROMPT = """You are an autonomous browser agent filling a government scheme application form. You must fill EVERY page of the form correctly — do NOT stop after one page.

═══ ABSOLUTE RULES (NEVER BREAK) ═══
• NEVER reload, refresh, press F5/Ctrl+R, or navigate away. You have NO navigation tools.
• NEVER press Enter except on a search input. For forms, ALWAYS click the Submit/Next button.
• NEVER guess or fabricate data. Use ONLY the user data below or ask the user.
• Work page by page until the ENTIRE form is submitted. Do NOT stop after one page.
• Be FAST — fill fields quickly, don't over-analyze. Act immediately.

═══ PAGE WORKFLOW (repeat for EVERY page) ═══
STEP 1 — READ: Call browser_read_screen to get all fields on the current page.
STEP 2 — FILL ALL FIELDS: Fill EVERY empty field one by one using the user data. For each field:
           a) Click it (use selector)
           b) Type or select the value
           Do ALL fields in rapid succession — do NOT read the screen between each field.
STEP 3 — SCROLL: Scroll down once to check for hidden fields. If more appear, fill them.
STEP 4 — CLICK NEXT: Click the Next/Submit/Continue button IMMEDIATELY after filling all visible fields.
           IMPORTANT: Use the button's selector (shown in brackets) to click.
           Example: if read_screen shows  - "Next →" [button.btn-next]  →  click with selector="button.btn-next"
           Only use text= if there is NO selector shown.
STEP 5 — CHECK RESULT: If the click returns validation errors, fix ONLY the errored fields, then click Next again.
           If the page changed (new fields appear), go back to STEP 1 for the new page.
STEP 6 — REPEAT until you see a success/confirmation message.

═══ SPEED RULES (CRITICAL) ═══
• Fill ALL fields from one read_screen call — do NOT read the screen after each individual field.
• After filling, click Next IMMEDIATELY. Do NOT do a verification read unless the click returned errors.
• Chain multiple tool calls: read → type → type → type → select → click — all in one sequence.
• Only read the screen again if: (a) page changed after Next click, (b) click returned errors, (c) you need to see new fields after scrolling.

═══ MULTI-PAGE FORMS ═══
Government forms typically have 3-8 pages. You MUST fill ALL pages:
- After clicking Next successfully, the page WILL change — call browser_read_screen to see the NEW page
- Each new page has NEW fields — repeat the workflow
- NEVER assume the form is done after one page. Only say FORM_COMPLETE when you see a success/confirmation message.
- If you see page indicators (Step 1 of 5, Tab 2, etc.), mention which page you are on.

═══ FILLING TECHNIQUES ═══
• Text inputs: click field (selector), then type value
• Dropdowns: use browser_select_option with the best matching option text
• Radio buttons / checkboxes: use browser_click on the correct option
• Consent/Terms checkboxes: REQUIRED — tick them BEFORE clicking Submit
• Date picker (type="date"): use YYYY-MM-DD format
• Date text (type="text"): use DD/MM/YYYY format
• AFTER clicking Next/Submit: If the URL is the SAME, validation errors blocked it. Fix errors, click again.

═══ ASKING THE USER ═══
If you encounter ANY field where you don't have the data → ask IMMEDIATELY:
Missing form data → WAITING_FOR_DATA:<field_names>:<question>
  Example: WAITING_FOR_DATA:father_name,mother_name:I need your father's name and mother's name.
Login page → WAITING_FOR_LOGIN_CHECK:<site>:Do you have an account on <site>? Answer Yes or No.
  If YES → WAITING_FOR_CREDENTIALS:<fields>:<question>
  If NO → Click Register/Sign Up/New User
Password for signup → WAITING_FOR_PASSWORD:Please choose a password for your new account (8+ chars, letters and numbers).
OTP field visible → Say WAITING_FOR_OTP and stop.
CAPTCHA visible → Say WAITING_FOR_CAPTCHA and stop.

═══ WHEN DONE ═══
Only say FORM_COMPLETE when you see a confirmation/success message.

═══ USER DATA ═══
{user_data}"""

# ---------------------------------------------------------------------------
# Tool definitions (Bedrock Converse toolSpec format — works with any model)
# ---------------------------------------------------------------------------

MISTRAL_TOOLS: List[Dict] = [
    {
        "toolSpec": {
            "name": "search_schemes",
            "description": "Search for government welfare schemes, private scholarships, and other programmes by keyword or category. Also use this to find scheme IDs.",
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
            "description": "Automatically match eligible schemes (government, private, scholarships, NGO) to the current user's profile.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "check_eligibility",
            "description": "Check if the user is eligible for a specific scheme (government or private).",
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
            "description": "Open a live browser and start automatically filling an application form. Works for government portals AND private scheme websites. Provide scheme_id for known schemes, or portal_url for any external website.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "scheme_id": {"type": "string", "description": "Scheme ID from our database (e.g. HEALTH001). Optional if portal_url is provided."},
                        "portal_url": {"type": "string", "description": "Direct URL of the application form or scheme website. Use this for private schemes not in our database."},
                        "scheme_name": {"type": "string", "description": "Human-readable name of the scheme (for display purposes)."}
                    },
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
            "name": "get_verified_user_data",
            "description": "Get a single consolidated view of the user's data — merges profile details with all document extractions. Shows one value per field and flags any conflicts between sources. Use this when the user asks about their details, documents, or profile.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "update_user_data",
            "description": "Update a user detail everywhere — profile AND all document records that contain this field. Use when user confirms or corrects a value. This ensures ONE consistent value across the entire system.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "field_name": {"type": "string", "description": "Field to update: name, dob, gender, address, state, district, pincode, annual_income, occupation, category, aadhaar_number, pan_number, father_name, mother_name, email, phone, bank_account, ifsc_code, bank_name, education_level, or any other field"},
                        "correct_value": {"type": "string", "description": "The correct value confirmed by the user"},
                    },
                    "required": ["field_name", "correct_value"],
                }
            },
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
    # ── Browser control tools (AI can freely operate the live browser) ──
    {
        "toolSpec": {
            "name": "web_search",
            "description": "Search the web using DuckDuckGo. Use this to find official URLs, verify links, or look up scheme information before navigating the browser.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                    },
                    "required": ["query"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_navigate",
            "description": "Navigate the live browser to a URL. Use web_search first to verify the URL.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "Full URL to navigate to (must start with http:// or https://)"},
                    },
                    "required": ["url"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_read_screen",
            "description": "Analyze what is currently visible on the live browser. Returns page title, URL, all form fields, buttons, links, and text content. ALWAYS call this after navigating or clicking to understand the current page state.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "browser_click",
            "description": "Click on an element in the live browser. Provide EITHER a CSS selector OR the visible text of the element.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "selector": {"type": "string", "description": "CSS selector (e.g. '#submit-btn', '.next-button', '[name=email]')"},
                        "text": {"type": "string", "description": "Visible text of the element to click (e.g. 'Submit', 'Next', 'Login')"},
                    },
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_type",
            "description": "Type text into an input field. If selector is given, clicks that field first. Otherwise types into the currently focused element.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "Text to type"},
                        "selector": {"type": "string", "description": "CSS selector of the input field (optional)"},
                        "clear_first": {"type": "boolean", "description": "Clear field before typing (default: true)"},
                    },
                    "required": ["text"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_scroll",
            "description": "Scroll the page up or down in the live browser.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "direction": {"type": "string", "description": "'up' or 'down' (default: down)"},
                        "amount": {"type": "integer", "description": "Pixels to scroll (default: 400)"},
                    },
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_press_key",
            "description": "Press a keyboard key in the live browser (Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, Space, etc).",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Key name: Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, Space, etc."},
                    },
                    "required": ["key"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_select_option",
            "description": "Select an option from a dropdown (<select>) element.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "selector": {"type": "string", "description": "CSS selector of the <select> element"},
                        "value": {"type": "string", "description": "Option value or visible text to select"},
                    },
                    "required": ["selector", "value"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "browser_back",
            "description": "Go back to the previous page in the live browser.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
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
                conv_id = data.get("conversation_id") or generate_id()
                session_state["conversation_id"] = conv_id

                # Load existing conversation from DB if resuming
                try:
                    existing = db.get_conversation(user_id, conv_id)
                    if existing and existing.get("messages"):
                        saved_msgs = existing["messages"]
                        if isinstance(saved_msgs, str):
                            saved_msgs = _json.loads(saved_msgs)
                        # Rebuild Bedrock-format history from saved messages
                        for m in saved_msgs:
                            session_state["conversation_history"].append({
                                "role": m["role"],
                                "content": [{"text": m.get("content", "")}],
                            })
                        logger.info(f"[WS] Resumed conversation {conv_id} with {len(saved_msgs)} messages")
                except Exception as e:
                    logger.warning(f"[WS] Could not load conversation {conv_id}: {e}")

                await websocket.send_json({
                    "type": "session_started",
                    "conversation_id": conv_id,
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

            elif msg_type == "submit_data":
                answer = data.get("data", "").strip()
                fields_str = data.get("fields", "")  # comma-separated field names
                session = form_agent_service.get_session(user_id)
                if session and session.waiting_for in ("data", "credentials", "password", "login_check"):
                    session.pending_data_response = answer
                    # Save provided data to known details (extra_details)
                    if session.waiting_for == "data" and fields_str and answer:
                        try:
                            from app.services.dynamodb_service import db as _db
                            user_record = _db.get_user(user_id) or {}
                            extra = user_record.get("extra_details") or {}
                            fields_list = [f.strip() for f in fields_str.split(",") if f.strip()]
                            # If single field, save directly
                            if len(fields_list) == 1:
                                key = fields_list[0].lower().replace(" ", "_")
                                extra[key] = answer
                            else:
                                # Multiple fields — try to parse key:value or key=value pairs from the answer
                                # Also store the raw response
                                for field in fields_list:
                                    key = field.lower().replace(" ", "_")
                                    # Look for "field_name: value" or "field_name = value" in the answer
                                    import re
                                    pattern = re.compile(rf'{re.escape(field)}\s*[:=]\s*(.+?)(?:,|\n|$)', re.IGNORECASE)
                                    match = pattern.search(answer)
                                    if match:
                                        extra[key] = match.group(1).strip()
                                # If no structured parsing worked, store the raw response
                                if not any(f.lower().replace(" ", "_") in extra for f in fields_list):
                                    extra["_last_form_response"] = answer
                            _db.update_user(user_id, {"extra_details": extra})
                        except Exception as e:
                            logger.warning(f"[WS] Failed to save data to known details: {e}")
                    await websocket.send_json({"type": "data_accepted", "success": True})
                else:
                    await websocket.send_json({"type": "data_accepted", "success": False})

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
# Persist a single user↔assistant turn to DynamoDB
# ---------------------------------------------------------------------------

def _save_turn_to_db(session_state: Dict, user_text: str, assistant_text: str, language: str) -> None:
    """Save the latest turn to DynamoDB conversation table (fire-and-forget)."""
    user_id = session_state.get("user_id")
    conv_id = session_state.get("conversation_id")
    if not user_id or not conv_id:
        return

    new_messages = [
        {"role": "user", "content": user_text, "timestamp": now_iso()},
        {"role": "assistant", "content": assistant_text, "timestamp": now_iso()},
    ]

    try:
        existing = db.get_conversation(user_id, conv_id)
        if existing:
            msgs = existing.get("messages", [])
            if isinstance(msgs, str):
                try:
                    msgs = _json.loads(msgs)
                except Exception:
                    msgs = []
            msgs.extend(new_messages)
            db.update_conversation(user_id, conv_id, {
                "messages": msgs,
                "language": language,
                "source": "voice",
            })
        else:
            db.save_conversation({
                "user_id": user_id,
                "conversation_id": conv_id,
                "messages": new_messages,
                "language": language,
                "source": "voice",
                "created_at": now_iso(),
            })
    except Exception as e:
        logger.warning(f"[WS] Could not save conversation turn: {e}")


# ---------------------------------------------------------------------------
# Audio handler: Sarvam STT → Mistral → Sarvam TTS
# ---------------------------------------------------------------------------


async def _handle_audio(audio_bytes: bytes, session_state: Dict, websocket: WebSocket) -> None:
    """Full voice turn: Sarvam STT → Mistral Large 3 (tool_use) → Sarvam TTS."""
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
    # If form agent is waiting for user data/credentials/login answer, route directly
    uid = session_state.get("user_id")
    if uid:
        _sess = form_agent_service.get_session(uid)
        if _sess and _sess.waiting_for in ("data", "credentials", "login_check"):
            _sess.pending_data_response = user_text
            ack = "Got it, continuing the form…"
            await websocket.send_json({"type": "transcript", "role": "assistant", "text": ack, "language": language})
            _audio = await sarvam_service.text_to_speech(ack, language)
            if _audio:
                await websocket.send_json({"type": "audio_response", "data": base64.b64encode(_audio).decode(), "transcript": ack, "language": language})
            await websocket.send_json({"type": "status", "status": "listening"})
            return
    await _process_and_respond(user_text, language, session_state, websocket)


async def _handle_text(text: str, session_state: Dict, websocket: WebSocket) -> None:
    """Typed text input — skip STT, run Mistral + TTS."""
    language = session_state.get("language", "en-IN")
    await websocket.send_json({"type": "transcript", "role": "user", "text": text, "language": language})
    # If form agent is waiting for user data/credentials/login answer, route directly
    uid = session_state.get("user_id")
    if uid:
        _sess = form_agent_service.get_session(uid)
        if _sess and _sess.waiting_for in ("data", "credentials", "login_check"):
            _sess.pending_data_response = text
            ack = "Got it, continuing the form…"
            await websocket.send_json({"type": "transcript", "role": "assistant", "text": ack, "language": language})
            _audio = await sarvam_service.text_to_speech(ack, language)
            if _audio:
                await websocket.send_json({"type": "audio_response", "data": base64.b64encode(_audio).decode(), "transcript": ack, "language": language})
            return
    await _process_and_respond(text, language, session_state, websocket)


async def _process_and_respond(
    user_text: str, language: str, session_state: Dict, websocket: WebSocket
) -> None:
    """Mistral Large 3 with tool_use → sentence-streaming Sarvam TTS → send audio."""
    response_text = await _run_mistral_with_tools(user_text, language, session_state, websocket)

    if not response_text:
        response_text = "Sorry, I could not process that. Please try again."

    await websocket.send_json({"type": "status", "status": "speaking"})
    await websocket.send_json({
        "type": "transcript", "role": "assistant", "text": response_text, "language": language
    })

    # Persist conversation to DynamoDB
    _save_turn_to_db(session_state, user_text, response_text, language)

    # Stream TTS sentence by sentence — first sentence plays ~400ms after Mistral responds
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
# Mistral Large 3 tool_use conversation loop
# ---------------------------------------------------------------------------


async def _run_mistral_with_tools(
    user_text: str, language: str, session_state: Dict, websocket: WebSocket
) -> str:
    loop = asyncio.get_running_loop()
    history: List[Dict] = session_state.setdefault("conversation_history", [])

    messages = list(history[-20:])
    messages.append({"role": "user", "content": [{"text": user_text}]})

    # Build doc context once per session (cache to avoid repeated DB calls)
    if "_doc_context" not in session_state:
        try:
            ctx = document_service.get_user_document_context(session_state["user_id"])
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

    for _ in range(15):  # max 15 tool-use iterations (browser control needs many steps)
        try:
            _msgs_snapshot = list(messages)  # snapshot to avoid stale lambda closure
            response = await loop.run_in_executor(
                None,
                lambda: bedrock_service.converse_raw(
                    model_id=settings.BEDROCK_MODEL_ID,
                    messages=_msgs_snapshot,
                    system=system,
                    tools=MISTRAL_TOOLS,
                    max_tokens=512,    # Enough for tool calls + short voice text
                    temperature=0.3,   # Low = fast, consistent
                ),
            )
        except Exception as e:
            logger.error(f"[Mistral] converse_raw error: {e}")
            return "I could not process that right now. Could you please repeat your question?"

        stop_reason = response.get("stopReason", "end_turn")
        output_content = response.get("output", {}).get("message", {}).get("content", [])

        if stop_reason in ("end_turn", "max_tokens"):
            final_text = " ".join(c.get("text", "") for c in output_content if "text" in c).strip()
            history.append({"role": "user", "content": [{"text": user_text}]})
            history.append({"role": "assistant", "content": output_content if output_content else [{"text": final_text}]})
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

    return "I could not find that information right now. Can you tell me more about what you need?"


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------


async def _execute_tool(tool: str, params: Dict, session_state: Dict, websocket: WebSocket) -> str:
    user_id = session_state["user_id"]
    profile = session_state["user_profile"]
    logger.info(f"[Tool] Executing: {tool} | params={params} | user={user_id}")

    try:
        if tool == "search_schemes":
            results = scheme_service.search_schemes(
                query=params.get("query", ""), category=params.get("category"), state=profile.get("state")
            )
            if not results:
                return "No schemes found."
            return f"Found {len(results)} schemes: {', '.join(s.get('name','') for s in results[:5])}"

        elif tool == "match_schemes":
            results = scheme_service.match_schemes(profile)
            if not results:
                return "No matching schemes found."
            return "Top matches: " + "; ".join(
                f"{s.get('name')} ({int(s.get('match_score',0)*100)}% match)" for s in results[:3]
            )

        elif tool == "check_eligibility":
            result = scheme_service.check_eligibility(profile, params.get("scheme_id"))
            if result.get("eligible"):
                return f"Eligible. Score: {int(result.get('match_score',0)*100)}%. {result.get('ai_analysis','')}"
            return f"Not eligible. Unmet: {', '.join(result.get('unmet_criteria',[]))}"

        elif tool == "start_form_filling":
            scheme_id = params.get("scheme_id", "")
            direct_url = params.get("portal_url", "")
            scheme_name = params.get("scheme_name", "")
            logger.info(f"[Tool:start_form_filling] scheme_id={scheme_id}, portal_url={direct_url}, user_id={user_id}")

            # Resolve portal URL: try DB scheme first, then direct URL
            scheme = scheme_service.get_scheme(scheme_id) if scheme_id else None
            if scheme:
                portal_url = scheme.get("portal_url") or scheme.get("application_url") or direct_url
                scheme_name = scheme_name or scheme.get("name", scheme_id)
            elif direct_url:
                # Private/external scheme — use the URL the AI provided
                portal_url = direct_url
                scheme_id = scheme_id or "EXTERNAL"
                scheme_name = scheme_name or "External Scheme"
            else:
                logger.warning(f"[Tool:start_form_filling] No scheme found and no URL provided")
                return "Could not find that scheme. Please provide either a scheme_id from search results or a portal_url for the scheme website."

            if not portal_url:
                logger.warning(f"[Tool:start_form_filling] No portal URL resolved for {scheme_id}")
                return "No portal URL available for this scheme. Please provide the application website URL."

            doc_map = document_service.get_document_map_for_form(user_id)
            user_data = {**profile, **doc_map}
            logger.info(f"[Tool:start_form_filling] Launching browser for {scheme_name}, portal={portal_url}, data_keys={list(user_data.keys())}")

            # Fire-and-forget: browser opens in background so Mistral responds immediately
            asyncio.create_task(_start_form_background(
                user_id=user_id,
                scheme_id=scheme_id,
                application_id=f"app_{user_id}",
                user_data=user_data,
                portal_url=portal_url,
                websocket=websocket,
                session_state=session_state,
            ))
            await websocket.send_json({
                "type": "form_started", "scheme_id": scheme_id,
                "session_id": f"sess_{user_id}_{scheme_id}", "show_novnc": True,
            })
            return f"Opening {scheme_name} in the live browser now. Watch the form being filled on screen."

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

        elif tool == "get_verified_user_data":
            # Merge profile + all document extracted data into one consolidated view
            merged: Dict[str, Dict] = {}  # field -> {"value": best, "sources": [...], "conflict": bool}

            # Profile fields mapping (DB key -> display label)
            PROFILE_KEYS = {
                "name": "name", "dob": "date_of_birth", "gender": "gender",
                "state": "state", "district": "district", "pincode": "pincode",
                "address": "address", "annual_income": "annual_income",
                "occupation": "occupation", "category": "category",
                "education_level": "education_level", "email": "email",
                "phone_number": "phone", "aadhaar_number": "aadhaar_number",
                "pan_number": "pan_number", "bank_name": "bank_name",
                "bank_account": "bank_account", "ifsc_code": "ifsc_code",
            }
            for db_key, field in PROFILE_KEYS.items():
                val = profile.get(db_key)
                if val:
                    merged[field] = {"value": str(val), "sources": ["profile"], "conflict": False}

            # Document extracted data
            docs = document_service.get_user_documents(user_id)
            doc_types_list = []
            for d in docs:
                doc_type = d.get("document_type", "unknown")
                doc_types_list.append(doc_type)
                extracted = d.get("extracted_data", {})
                if not isinstance(extracted, dict):
                    continue
                for k, v in extracted.items():
                    if isinstance(v, dict):
                        for sk, sv in v.items():
                            if sv:
                                self_key = sk.lower().replace(" ", "_")
                                sv_str = str(sv).strip()
                                if self_key in merged:
                                    existing = merged[self_key]["value"].strip().lower()
                                    if sv_str.lower() != existing:
                                        merged[self_key]["conflict"] = True
                                        if doc_type not in merged[self_key]["sources"]:
                                            merged[self_key]["sources"].append(doc_type)
                                            merged[self_key]["value"] = merged[self_key]["value"] + f" [BUT {doc_type} says: {sv_str}]"
                                    else:
                                        if doc_type not in merged[self_key]["sources"]:
                                            merged[self_key]["sources"].append(doc_type)
                                else:
                                    merged[self_key] = {"value": sv_str, "sources": [doc_type], "conflict": False}
                    elif v:
                        norm_key = k.lower().replace(" ", "_")
                        v_str = str(v).strip()
                        if norm_key in merged:
                            existing = merged[norm_key]["value"].split(" [BUT")[0].strip().lower()
                            if v_str.lower() != existing:
                                merged[norm_key]["conflict"] = True
                                if doc_type not in merged[norm_key]["sources"]:
                                    merged[norm_key]["sources"].append(doc_type)
                                    merged[norm_key]["value"] = merged[norm_key]["value"] + f" [BUT {doc_type} says: {v_str}]"
                            else:
                                if doc_type not in merged[norm_key]["sources"]:
                                    merged[norm_key]["sources"].append(doc_type)
                        else:
                            merged[norm_key] = {"value": v_str, "sources": [doc_type], "conflict": False}

            if not merged:
                return "No data found. Profile is empty and no documents uploaded."

            lines = []
            lines.append(f"Uploaded documents: {', '.join(doc_types_list) if doc_types_list else 'none'}")
            lines.append("")
            conflicts = []
            for field, info in merged.items():
                label = field.replace("_", " ").title()
                src = " + ".join(info["sources"])
                if info["conflict"]:
                    lines.append(f"CONFLICT {label}: {info['value']} (from {src})")
                    conflicts.append(label)
                else:
                    lines.append(f"{label}: {info['value']} (from {src})")
            if conflicts:
                lines.append(f"\nCONFLICTS FOUND in: {', '.join(conflicts)}. Ask the user which value is correct for each.")
            else:
                lines.append("\nNo conflicts found. Ask the user to confirm these details are correct.")
            return "\n".join(lines)

        elif tool == "update_user_data":
            field_name = params.get("field_name", "").lower().replace(" ", "_")
            correct_value = params.get("correct_value", "")
            if not field_name or not correct_value:
                return "Need field_name and correct_value."

            # 1. Update profile if field exists there
            PROFILE_FIELD_MAP = {
                "name": "name", "date_of_birth": "dob", "dob": "dob",
                "gender": "gender", "state": "state", "district": "district",
                "pincode": "pincode", "address": "address",
                "annual_income": "annual_income", "occupation": "occupation",
                "category": "category", "education_level": "education_level",
                "email": "email", "phone": "phone_number",
                "aadhaar_number": "aadhaar_number", "pan_number": "pan_number",
                "bank_name": "bank_name", "bank_account": "bank_account",
                "ifsc_code": "ifsc_code", "father_name": "father_name",
                "mother_name": "mother_name",
            }
            profile_key = PROFILE_FIELD_MAP.get(field_name)
            if profile_key:
                val = int(correct_value) if profile_key == "annual_income" and correct_value.isdigit() else correct_value
                try:
                    db.update_user(user_id, {profile_key: val})
                except Exception as e:
                    logger.warning(f"Profile update for {profile_key}: {e}")
                # Also update in-memory session profile
                profile[profile_key] = val

            # 2. Update extracted_data in ALL documents that contain this field
            docs = document_service.get_user_documents(user_id)
            updated_docs = 0
            for doc in docs:
                extracted = doc.get("extracted_data", {})
                if not isinstance(extracted, dict):
                    continue
                changed = False
                # Top-level field
                if field_name in extracted:
                    extracted[field_name] = correct_value
                    changed = True
                # Nested field
                for k, v in extracted.items():
                    if isinstance(v, dict) and field_name in v:
                        v[field_name] = correct_value
                        changed = True
                if changed:
                    db.update_document(user_id, doc["document_id"], {"extracted_data": extracted})
                    updated_docs += 1

            return f"Updated '{field_name}' to '{correct_value}' in profile{f' and {updated_docs} document(s)' if updated_docs else ''}."

        elif tool == "check_documents":
            scheme_id = params.get("scheme_id", "")
            scheme = scheme_service.get_scheme(scheme_id)
            if not scheme:
                return f"Scheme '{scheme_id}' not found."
            required_docs = scheme.get("required_documents", [])
            if not required_docs:
                return "This scheme has no specific document requirements listed."
            result = document_service.check_required_documents(user_id, required_docs)
            if result.get("all_available"):
                return "All required documents available."
            return f"Available: {', '.join(result.get('available',[]))}. Missing: {', '.join(result.get('missing',[]))}"

        # ── Browser control tools ────────────────────────────────
        elif tool == "web_search":
            query = params.get("query", "")
            results = await web_search_service.search(query, max_results=8)
            if not results:
                return "No search results found."
            lines = []
            for i, r in enumerate(results[:8], 1):
                title = r.get("title", "")
                url = r.get("href", "")
                snippet = r.get("body", "")[:120]
                lines.append(f"{i}. {title}\n   URL: {url}\n   {snippet}")
            return "\n".join(lines)

        elif tool == "browser_navigate":
            return "Navigation is DISABLED during form filling. Do NOT try to navigate. Continue filling the current form."

        elif tool == "browser_read_screen":
            result = await form_agent_service.browser_action(user_id, "read_screen", {})
            if not result.get("success"):
                return f"Could not read screen: {result.get('error')}"
            lines = [f"Page: {result.get('url', '?')}", f"Title: {result.get('title', '?')}"]
            if result.get("headings"):
                lines.append(f"Headings: {' | '.join(result['headings'][:8])}")
            if result.get("inputs"):
                lines.append("Input fields:")
                for inp in result["inputs"]:
                    inp_type = inp.get('type', 'text')
                    if inp_type in ('checkbox', 'radio'):
                        state = '[CHECKED ✓]' if inp.get('checked') or inp.get('value') == 'checked' else '[UNCHECKED ✗ — needs to be ticked if required]'
                        lines.append(f"  - {inp.get('label','')} [{inp.get('selector','')}] ({inp_type}) {state}")
                    else:
                        val_str = inp.get('value', '')
                        filled = f", CURRENT VALUE='{val_str}'" if val_str else ", EMPTY"
                        lines.append(f"  - {inp.get('label','')} [{inp.get('selector','')}] ({inp_type}{filled})")
            if result.get("selects"):
                lines.append("Dropdowns:")
                for sel in result["selects"]:
                    opts = ', '.join(sel.get('options', [])[:8])
                    selected = sel.get('selected', '')
                    lines.append(f"  - {sel.get('label','')} [{sel.get('selector','')}] (SELECTED: '{selected}', options: {opts})")

            # Add a verification summary showing fields with values vs empty
            filled_count = sum(1 for inp in result.get("inputs", []) if inp.get("value") and inp.get('type') not in ('checkbox','radio'))
            empty_count = sum(1 for inp in result.get("inputs", []) if not inp.get("value") and inp.get('type') not in ('checkbox','radio'))
            unchecked_count = sum(1 for inp in result.get("inputs", []) if inp.get('type') in ('checkbox','radio') and not inp.get('checked') and inp.get('value') != 'checked')
            filled_selects = sum(1 for sel in result.get("selects", []) if sel.get("selected") and sel["selected"] not in ("--Select--", "Select", "", "Choose", "--"))
            total_selects = len(result.get("selects", []))
            status_parts = [f"{filled_count} inputs filled", f"{empty_count} inputs empty", f"{filled_selects}/{total_selects} dropdowns selected"]
            if unchecked_count:
                status_parts.append(f"{unchecked_count} UNCHECKED CHECKBOX(ES) — tick before submitting")
            lines.append(f"\n[FIELD STATUS: {', '.join(status_parts)}]")
            if result.get("validation_errors"):
                lines.append("\n⚠ VALIDATION ERRORS (fix these before clicking Next/Submit):")
                for err in result["validation_errors"]:
                    lines.append(f"  ! {err}")
            if result.get("buttons"):
                lines.append("Buttons (use selector to click reliably):")
                for b in result["buttons"]:
                    sel_str = f" [{b['selector']}]" if b.get("selector") else ""
                    lines.append(f"  - \"{b['text']}\"{sel_str}")
            if result.get("links"):
                lines.append("Links: " + ", ".join(f"{l['text']}" for l in result["links"][:5]))
            if result.get("text_content"):
                lines.append(f"Page text: {result['text_content'][:400]}")
            return "\n".join(lines)

        elif tool == "browser_click":
            result = await form_agent_service.browser_action(user_id, "click", params)
            if result.get("success"):
                if result.get("validation_errors") or result.get("warning"):
                    warning = result.get("warning", "")
                    errs = result.get("validation_errors", [])
                    err_str = " | ".join(errs) if errs else warning
                    return (f"Clicked but the page did NOT change — form validation BLOCKED the submission.\n"
                            f"ERRORS: {err_str}\n"
                            "You MUST fix these errors first. Call browser_read_screen to see the full field state, "
                            "then fix every error (e.g. tick unchecked checkboxes, fill empty required fields). "
                            "Then click Next/Submit again.")
                return f"Clicked successfully. Read the screen to see the new page."
            return f"Click failed: {result.get('error')}"

        elif tool == "browser_type":
            # Substitute password placeholder with real value from session
            if params.get("text") == "__USER_PASSWORD__":
                session = form_agent_service.get_session(user_id)
                if session and hasattr(session, '_password_value') and session._password_value:
                    params["text"] = session._password_value
            result = await form_agent_service.browser_action(user_id, "type", params)
            if result.get("success"):
                return f"Typed into the field successfully."
            return f"Type failed: {result.get('error')}"

        elif tool == "browser_scroll":
            result = await form_agent_service.browser_action(user_id, "scroll", params)
            if result.get("success"):
                return f"Scrolled {result.get('scrolled', 'down')} {result.get('pixels', 400)}px. Call browser_read_screen to see what is now visible."
            return f"Scroll failed: {result.get('error')}"

        elif tool == "browser_press_key":
            result = await form_agent_service.browser_action(user_id, "press_key", params)
            if result.get("success"):
                return f"Pressed {result.get('key', '')} key."
            return f"Key press failed: {result.get('error')}"

        elif tool == "browser_select_option":
            result = await form_agent_service.browser_action(user_id, "select_option", params)
            if result.get("success"):
                return f"Selected '{result.get('selected', '')}' in dropdown."
            return f"Select failed: {result.get('error')}"

        elif tool == "browser_back":
            return "Back navigation is DISABLED during form filling. Do NOT go back. Continue filling the current form."

        else:
            return f"Unknown tool: {tool}"

    except Exception as e:
        logger.error(f"[Tool:{tool}] {e}", exc_info=True)
        return f"Tool {tool} could not complete the request right now. Suggest an alternative approach to the user or ask for more details."


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
    session_state: Dict,
) -> None:
    """Launch browser + start form session, then hand off to autonomous agent."""
    logger.info(f"[WS] _start_form_background starting for user={user_id}, scheme={scheme_id}, portal={portal_url}")
    try:
        await form_agent_service.start_session(
            user_id=user_id,
            scheme_id=scheme_id,
            application_id=application_id,
            user_data=user_data,
            portal_url=portal_url,
            websocket=websocket,
        )
        logger.info(f"[WS] Form session started, launching autonomous agent for user={user_id}")
        # Hand off to autonomous browser agent — it navigates, fills, and submits on its own
        asyncio.create_task(_run_autonomous_browser_agent(
            user_id=user_id,
            session_state=session_state,
            websocket=websocket,
            user_data=user_data,
        ))
    except Exception as e:
        logger.error(f"[WS] Form background start error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": f"Could not open browser: {e}"})
        except Exception:
            pass


async def _run_autonomous_browser_agent(
    user_id: str,
    session_state: Dict,
    websocket: WebSocket,
    user_data: Dict,
) -> None:
    """
    Autonomous browser agent — reads the screen, decides actions, fills forms,
    and submits without any user direction. Runs as a background asyncio task.
    """
    await asyncio.sleep(3)  # let the browser fully load

    session = form_agent_service.get_session(user_id)
    if not session or not session._page:
        logger.warning("[AutoAgent] No active session after wait, aborting")
        return

    language = session_state.get("language", "en-IN")
    loop = asyncio.get_running_loop()

    # Build user data string for the agent prompt
    data_lines = []
    for k, v in user_data.items():
        if v and str(v).strip():
            data_lines.append(f"  {k}: {v}")
    user_data_str = "\n".join(data_lines) if data_lines else "  No user data available"

    system = AUTONOMOUS_AGENT_PROMPT.replace("{user_data}", user_data_str)

    # Only browser-control tools for the agent
    # Only form-filling tools — no navigate/back/web_search to prevent page reloads
    browser_tools = [t for t in MISTRAL_TOOLS if t["toolSpec"]["name"] in {
        "browser_read_screen", "browser_click", "browser_type", "browser_scroll",
        "browser_press_key", "browser_select_option",
    }]

    messages: List[Dict] = [{
        "role": "user",
        "content": [{"text": (
            "The browser is open on the scheme portal. "
            "Read the screen, fill ALL fields fast, then click Next/Submit. "
            "This form has MULTIPLE pages — keep going until you see a confirmation message. "
            "Be fast: read → fill all → click Next. No unnecessary re-reads."
        )}],
    }]

    logger.info(f"[AutoAgent] Starting for user={user_id}")

    # Stuck detection: track recent tool calls and no-progress rounds
    last_tool_calls: List[str] = []  # last N tool signatures for repetition detection
    no_progress_rounds = 0
    MAX_NO_PROGRESS = 5  # abort after this many rounds with no meaningful action
    pages_completed = 0  # track multi-page progress

    try:
        for outer_round in range(40):
            session = form_agent_service.get_session(user_id)
            if not session or not session._page:
                logger.info("[AutoAgent] Session gone, stopping")
                break

            made_progress = False  # track if this round did something useful

            # Inner tool-chain loop (model may chain several tool calls)
            for _inner in range(20):
                try:
                    _snap = list(messages[-30:])
                    response = await loop.run_in_executor(
                        None,
                        lambda _m=_snap: bedrock_service.converse_raw(
                            model_id=settings.BEDROCK_MODEL_ID,
                            messages=_m,
                            system=system,
                            tools=browser_tools,
                            max_tokens=512,
                            temperature=0.1,
                        ),
                    )
                except Exception as e:
                    logger.error(f"[AutoAgent] Mistral error: {e}")
                    return

                stop_reason = response.get("stopReason", "end_turn")
                output_content = response.get("output", {}).get("message", {}).get("content", [])

                if stop_reason == "tool_use":
                    messages.append({"role": "assistant", "content": output_content})
                    tool_results = []
                    for tu in [c["toolUse"] for c in output_content if "toolUse" in c]:
                        tool_sig = f"{tu['name']}:{str(tu.get('input', {}))[:100]}"

                        # Detect if agent is repeating the exact same tool call
                        if tool_sig in last_tool_calls[-3:]:
                            logger.warning(f"[AutoAgent] Repeated tool call detected: {tu['name']}")

                        last_tool_calls.append(tool_sig)
                        if len(last_tool_calls) > 10:
                            last_tool_calls.pop(0)

                        # Track progress — read_screen alone doesn't count
                        if tu["name"] != "browser_read_screen":
                            made_progress = True

                        result = await _execute_tool(
                            tu["name"], tu.get("input", {}), session_state, websocket
                        )
                        tool_results.append({
                            "toolResult": {
                                "toolUseId": tu["toolUseId"],
                                "content": [{"text": result}],
                            }
                        })
                    messages.append({"role": "user", "content": tool_results})
                    await asyncio.sleep(0.1)  # minimal delay between tool chains
                    continue  # let Mistral chain the next tool call

                # end_turn / max_tokens — Mistral produced text
                text = " ".join(
                    c.get("text", "") for c in output_content if "text" in c
                ).strip()
                messages.append({
                    "role": "assistant",
                    "content": output_content if output_content else [{"text": text}],
                })

                # Send progress update to user
                if text:
                    try:
                        await websocket.send_json({
                            "type": "transcript", "role": "assistant",
                            "text": text, "language": language,
                        })
                    except Exception:
                        return  # WebSocket closed

                text_lower = (text or "").lower()

                # OTP detected — trigger modal and wait
                if "waiting_for_otp" in text_lower:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        session.waiting_for = "otp"
                        session.status = "waiting_otp"
                        try:
                            await websocket.send_json({
                                "type": "form_update",
                                "data": {
                                    "status": "waiting_otp",
                                    "waiting_for": "otp",
                                    "message": "Please enter the OTP sent to your phone.",
                                },
                            })
                        except Exception:
                            pass
                        for _ in range(120):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s or s.waiting_for is None:
                                break
                        messages.append({
                            "role": "user",
                            "content": [{"text": "OTP has been entered. Continue filling the form."}],
                        })
                    break

                # Missing data detected — ask user and wait
                # Detect multiple formats: WAITING_FOR_DATA:fields:question, or natural language about missing data
                is_data_request = "waiting_for_data" in text_lower
                if not is_data_request:
                    # Also detect natural language data requests
                    data_phrases = ["i need", "i don't have", "missing information", "please provide",
                                    "i require", "could you provide", "what is your", "what are your",
                                    "i cannot find", "not available in", "no data for"]
                    if any(phrase in text_lower for phrase in data_phrases) and any(
                        w in text_lower for w in ["field", "form", "fill", "data", "information", "name", "number", "address"]):
                        is_data_request = True
                if is_data_request:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        # Parse WAITING_FOR_DATA:<fields>:<question>
                        data_question = text or "Please provide the missing information."
                        data_fields = ""
                        for line in (text or "").split("\n"):
                            upper_line = line.upper()
                            if "WAITING_FOR_DATA" in upper_line:
                                # Try splitting on WAITING_FOR_DATA first, then on colons
                                after_marker = line[line.upper().index("WAITING_FOR_DATA") + len("WAITING_FOR_DATA"):]
                                after_marker = after_marker.lstrip(":")
                                parts = after_marker.split(":", 1)
                                if len(parts) >= 2:
                                    data_fields = parts[0].strip()
                                    data_question = parts[1].strip()
                                elif len(parts) >= 1 and parts[0].strip():
                                    data_fields = parts[0].strip()
                                break

                        session.waiting_for = "data"
                        session.status = "filling"
                        session.pending_data_response = None
                        # Ask in chat + speak the question
                        try:
                            await websocket.send_json({"type": "transcript", "role": "assistant", "text": data_question, "language": language})
                            _audio = await sarvam_service.text_to_speech(data_question, language)
                            if _audio:
                                await websocket.send_json({"type": "audio_response", "data": base64.b64encode(_audio).decode(), "transcript": data_question, "language": language})
                        except Exception:
                            pass
                        # Wait up to 5 minutes for user to respond
                        user_response_text = None
                        for _ in range(300):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s:
                                break
                            if s.pending_data_response is not None:
                                user_response_text = s.pending_data_response
                                s.pending_data_response = None
                                s.waiting_for = None
                                s.status = "filling"
                                break
                            if s.waiting_for is None:
                                break
                        if user_response_text:
                            messages.append({
                                "role": "user",
                                "content": [{"text": f"The user provided this information: {user_response_text}. Use it to continue filling the form."}],
                            })
                        else:
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user did not provide the information. Skip those fields if possible and continue with the rest of the form."}],
                            })
                    break

                # Login check — ask user yes/no if they have credentials
                if "waiting_for_login_check" in text_lower:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        login_question = "Do you already have an account on this portal?"
                        for line in (text or "").split("\n"):
                            if "WAITING_FOR_LOGIN_CHECK" in line.upper():
                                parts = line.split(":", 2)
                                if len(parts) >= 3:
                                    login_question = parts[2].strip()
                                elif len(parts) >= 2:
                                    login_question = parts[1].strip()
                                break

                        session.waiting_for = "login_check"
                        session.status = "filling"
                        session.pending_data_response = None
                        # Ask in chat + speak the question
                        try:
                            await websocket.send_json({"type": "transcript", "role": "assistant", "text": login_question, "language": language})
                            _audio = await sarvam_service.text_to_speech(login_question, language)
                            if _audio:
                                await websocket.send_json({"type": "audio_response", "data": base64.b64encode(_audio).decode(), "transcript": login_question, "language": language})
                        except Exception:
                            pass
                        user_response_text = None
                        for _ in range(300):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s:
                                break
                            if s.pending_data_response is not None:
                                user_response_text = s.pending_data_response
                                s.pending_data_response = None
                                s.waiting_for = None
                                s.status = "filling"
                                break
                            if s.waiting_for is None:
                                break
                        if user_response_text and user_response_text.lower().strip() in ("yes", "y"):
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user says YES, they have an account. Ask for their login credentials using WAITING_FOR_CREDENTIALS."}],
                            })
                        else:
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user says NO, they do not have an account. Click on 'Register', 'Sign Up', 'New User', or 'Create Account' to go to the registration page."}],
                            })
                    break

                # Credentials request — ask user for specific login fields
                if "waiting_for_credentials" in text_lower:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        cred_question = "Please provide your login credentials."
                        cred_fields = ""
                        for line in (text or "").split("\n"):
                            if "WAITING_FOR_CREDENTIALS" in line.upper():
                                parts = line.split(":", 2)
                                if len(parts) >= 3:
                                    cred_fields = parts[1].strip()
                                    cred_question = parts[2].strip()
                                elif len(parts) >= 2:
                                    cred_fields = parts[1].strip()
                                break

                        session.waiting_for = "credentials"
                        session.status = "filling"
                        session.pending_data_response = None
                        # Ask in chat + speak the question
                        try:
                            await websocket.send_json({"type": "transcript", "role": "assistant", "text": cred_question, "language": language})
                            _audio = await sarvam_service.text_to_speech(cred_question, language)
                            if _audio:
                                await websocket.send_json({"type": "audio_response", "data": base64.b64encode(_audio).decode(), "transcript": cred_question, "language": language})
                        except Exception:
                            pass
                        user_response_text = None
                        for _ in range(300):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s:
                                break
                            if s.pending_data_response is not None:
                                user_response_text = s.pending_data_response
                                s.pending_data_response = None
                                s.waiting_for = None
                                s.status = "filling"
                                break
                            if s.waiting_for is None:
                                break
                        if user_response_text:
                            messages.append({
                                "role": "user",
                                "content": [{"text": f"The user provided their credentials: {user_response_text}. Use these to log in."}],
                            })
                        else:
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user did not provide credentials. Try clicking Register/Sign Up instead."}],
                            })
                    break

                # Password request — ask user to set a password for signup
                if "waiting_for_password" in text_lower:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        pwd_question = "Please choose a password for your new account."
                        for line in (text or "").split("\n"):
                            if "WAITING_FOR_PASSWORD" in line.upper():
                                parts = line.split(":", 1)
                                if len(parts) >= 2:
                                    pwd_question = parts[1].strip()
                                break

                        session.waiting_for = "password"
                        session.status = "waiting_password"
                        session.pending_data_response = None
                        try:
                            await websocket.send_json({
                                "type": "form_update",
                                "data": {
                                    "status": "waiting_password",
                                    "waiting_for": "password",
                                    "message": pwd_question,
                                },
                            })
                        except Exception:
                            pass
                        user_response_text = None
                        for _ in range(300):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s:
                                break
                            if s.pending_data_response is not None:
                                user_response_text = s.pending_data_response
                                s.pending_data_response = None
                                s.waiting_for = None
                                s.status = "filling"
                                break
                            if s.waiting_for is None:
                                break
                        if user_response_text:
                            # Store password on session for the agent to use - don't put raw password in AI messages
                            session._password_value = user_response_text
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user has set a password. When you need to type it into the password field and confirm password field, use browser_type with the exact text __USER_PASSWORD__ — it will be replaced with the real password automatically."}],
                            })
                        else:
                            messages.append({
                                "role": "user",
                                "content": [{"text": "The user did not provide a password. You cannot proceed with registration without a password. Say FORM_COMPLETE and explain."}],
                            })
                    break

                # CAPTCHA detected — trigger modal (periodic screenshot loop provides the image)
                if "waiting_for_captcha" in text_lower:
                    session = form_agent_service.get_session(user_id)
                    if session:
                        session.waiting_for = "captcha"
                        session.status = "waiting_captcha"
                        try:
                            await websocket.send_json({
                                "type": "form_update",
                                "data": {
                                    "status": "waiting_captcha",
                                    "waiting_for": "captcha",
                                    "message": "Please solve the CAPTCHA.",
                                },
                            })
                        except Exception:
                            pass
                        for _ in range(120):
                            await asyncio.sleep(1)
                            s = form_agent_service.get_session(user_id)
                            if not s or s.waiting_for is None:
                                break
                        messages.append({
                            "role": "user",
                            "content": [{"text": "CAPTCHA has been solved. Continue filling the form."}],
                        })
                    break

                # Agent says it's done
                if "form_complete" in text_lower or any(
                    w in text_lower
                    for w in ["submitted successfully", "application complete", "cannot proceed further"]
                ):
                    logger.info(f"[AutoAgent] Finished: {text[:120]}")
                    return

                if text:
                    made_progress = True  # agent produced meaningful text

                break  # exit inner loop, go to next outer round

            # Stuck detection — instead of aborting, force the agent to ask for data or read the screen
            if not made_progress:
                no_progress_rounds += 1
                logger.warning(f"[AutoAgent] No progress in round {outer_round} ({no_progress_rounds}/{MAX_NO_PROGRESS})")
                if no_progress_rounds >= MAX_NO_PROGRESS:
                    logger.error(f"[AutoAgent] Stuck for {MAX_NO_PROGRESS} rounds, forcing data request")
                    # Instead of aborting, force a read_screen and tell agent to ask for missing data
                    try:
                        force_read = await _execute_tool("browser_read_screen", {}, session_state, websocket)
                        messages.append({
                            "role": "user",
                            "content": [{"text": (
                                f"STUCK for {MAX_NO_PROGRESS} rounds. Current screen:\n{force_read}\n\n"
                                "ACTION REQUIRED: Either fill empty fields and click Next, or say WAITING_FOR_DATA for missing fields. "
                                "Do NOT reload. Do NOT repeat the same actions."
                            )}],
                        })
                        no_progress_rounds = 3  # reset partially, give it 2 more tries
                    except Exception as e:
                        logger.error(f"[AutoAgent] Force read failed: {e}")
                        return
            else:
                no_progress_rounds = 0  # reset on progress

            # Check for repetitive tool calls (same 3 calls repeating)
            if len(last_tool_calls) >= 6:
                recent = last_tool_calls[-6:]
                if recent[:3] == recent[3:]:
                    logger.warning(f"[AutoAgent] Repetitive tool call pattern, forcing data check")
                    last_tool_calls.clear()  # clear to break the pattern
                    messages.append({
                        "role": "user",
                        "content": [{"text": (
                            "STOP — you are looping. Read the screen once, fill empty fields, and click Next. "
                            "If you need data, say WAITING_FOR_DATA. Do NOT repeat the same calls."
                        )}],
                    })

            # Track page transitions (if agent clicked Next/Submit that worked)
            for tc in last_tool_calls[-5:]:
                if "browser_click" in tc and any(w in tc.lower() for w in ["next", "submit", "continue", "proceed", "save"]):
                    pages_completed += 1
                    break

            # Inject continuation prompt — keep it short to reduce token usage
            messages.append({
                "role": "user",
                "content": [{"text": (
                    f"Continue (page {pages_completed + 1}). "
                    "Read screen → fill empty fields → click Next/Submit. "
                    "If missing data → WAITING_FOR_DATA. Do NOT re-read after filling — click Next immediately."
                )}],
            })
            await asyncio.sleep(0.2)

    except asyncio.CancelledError:
        logger.info(f"[AutoAgent] Cancelled for user={user_id}")
    except Exception as e:
        logger.error(f"[AutoAgent] Unexpected error: {e}", exc_info=True)

    logger.info(f"[AutoAgent] Done for user={user_id}")
