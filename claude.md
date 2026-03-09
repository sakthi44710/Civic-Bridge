# CivicBridge — Developer Reference

> Internal development reference for debugging and AI assistant context.

---

## Quick Start

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
playwright install chromium
cp .env.example .env          # fill in keys
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev                   # port 5173
```

---

## Architecture

```
Frontend (React + Vite + TypeScript)
  └── WebSocket ↔ Backend

Backend (FastAPI)
  ├── WS /ws/voice — voice pipeline + autonomous browser agent
  ├── REST /api/v1/* — auth, users, chat, docs, schemes, applications
  ├── Sarvam AI STT (saarika:v2) + TTS (bulbul:v3, Ishita, 8kHz)
  ├── Claude Sonnet 4.6 (Bedrock us-west-2) — tool_use loop
  ├── Playwright headful on Xvfb :99 — autonomous form filling
  └── DynamoDB + S3 + Textract + Comprehend
```

---

## Key Services

| Service | Singleton | Purpose |
|---------|-----------|---------|
| `sarvam_service` | Yes | STT + TTS for 22 Indian languages |
| `bedrock_service` | Yes | Claude Sonnet 4.6 via Bedrock Converse API |
| `scheme_service` | Yes | Scheme search, match, eligibility |
| `document_service` | Yes | Upload → S3 → OCR → classify → extract |
| `form_agent_service` | Yes | Playwright browser sessions + screenshot streaming |
| `auth_service` | Yes | JWT + OTP (Twilio) + Google OAuth |

---

## WebSocket Protocol (WS /api/v1/ws/voice)

### Client → Server
| type | Purpose |
|------|---------|
| `session_start` | Init session with language |
| Binary frame | WebM/Opus audio (push-to-talk) |
| `text_message` | Typed text input |
| `submit_otp` | Relay OTP to browser |
| `submit_captcha` | Relay CAPTCHA answer |
| `session_end` | End session |

### Server → Client
| type | Purpose |
|------|---------|
| `session_started` | Confirms init |
| `transcript` | STT transcript |
| `audio_response` | TTS audio (base64 WAV) |
| `form_update` | Form filling progress |
| `form_screenshot` | Live browser screenshot (base64 JPEG) |
| `error` | Error message |

---

## AI Tools (Claude tool_use)

| Tool | Purpose |
|------|---------|
| `search_schemes` | Search schemes by keyword/category |
| `match_schemes` | Auto-match from profile |
| `check_eligibility` | Check eligibility for a scheme |
| `start_form_filling` | Launch autonomous browser agent |
| `get_form_status` | Current form progress |
| `get_user_profile` | User profile summary |
| `get_user_documents` | List uploaded docs |
| `check_documents` | Check missing docs for scheme |
| `browser_read_screen` | AI reads current page |
| `browser_click` | Click element |
| `browser_type` | Type into field |
| `browser_scroll` | Scroll page |
| `browser_navigate` | Navigate to URL |
| `browser_select_option` | Select dropdown option |
| `browser_press_key` | Press keyboard key |
| `browser_back` | Go back |

---

## Key Patterns

- **Playwright threading**: All Playwright calls run in `_pw_executor` (single `ThreadPoolExecutor`). Never use `async_playwright` with uvicorn on Windows.
- **Autonomous agent**: `_run_autonomous_browser_agent()` — 25 rounds × 12 tool-chains, runs as background `asyncio.Task`.
- **Periodic screenshots**: `_periodic_screenshot_loop` every 750ms streams JPEG to frontend.
- **Sentence-streaming TTS**: Claude response split by `[.!?।]`, each sentence TTS'd and sent as it's ready.
- **Audio interruption**: `_stopAllAudio()` in frontend closes AudioContext immediately when user sends new message.
- **CAPTCHA handling**: Agent says `WAITING_FOR_CAPTCHA` → scrolls captcha into view → modal shown → user types → agent resumes.

---

## Common Issues

| Issue | Fix |
|-------|-----|
| Playwright subprocess error on Windows | Use sync API in `ThreadPoolExecutor`, never `async_playwright` |
| Screenshot doesn't show CAPTCHA | `_scroll_captcha_into_view()` runs before screenshot when `waiting_for == "captcha"` |
| AI voice doesn't stop on new message | `_stopAllAudio()` closes AudioContext + resets counters |
| Form agent not triggered from text | `text_message` handler also detects form trigger keywords |
