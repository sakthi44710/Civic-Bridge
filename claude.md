4]# CivicBridge — Project Reference

> **Last updated:** 2026-03-08 (Sarvam AI STT/TTS + Claude Haiku 4.5, noVNC live browser, SNS OTP)
> This file is the single source of truth for debugging, development, and AI assistant reference.
> Update this file with every significant change.

---

## Quick Start

```bash
# Backend
cd backend
python -m venv .venv          # or use existing: .venv at project root
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env          # fill in AWS creds, JWT secret, etc.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev                   # Vite dev server on port 5173
```

**Python:** 3.14.3 — venv at `D:\PROJECTS\Civic Bridge\.venv\Scripts\python.exe`
**Node:** via npm — Vite 5.4.21 on port 5173
**Backend:** FastAPI on port 8000 with `--reload`

---

## Project Overview

CivicBridge is an AI-powered platform helping Indian citizens discover and apply for government welfare schemes through voice-first, multilingual interactions. Key capabilities:

- **Voice AI Chat** — Sarvam AI (saarika:v2 STT + bulbul:v2 TTS) + Claude Haiku 4.5 (Bedrock) for full voice pipeline
- **Auto Language Detection** — Sarvam STT detects spoken language; AI responds and speaks back in the same language
- **Scheme Discovery** — Search, match, and check eligibility for government schemes
- **Live Form Filling** — Playwright browser automation + noVNC live streaming (user watches real browser)
- **Document Management** — Upload, OCR (Textract), classify (Bedrock), and auto-extract data
- **Multi-language** — 22 Indian languages via Sarvam AI + AWS Translate
- **Google OAuth + OTP Auth** — Cognito federation + phone OTP via AWS SNS

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                   │
│  VoiceChat.jsx ─── useElevenLabsCall.js ─── Sarvam AI (STT+TTS)│
│       │                    │                                      │
│       │              Backend WebSocket  ← audio binary frames     │
│  noVNC <iframe>  ──────────┤  (full voice pipeline)              │
│  port 6080                 │                                      │
└────────────────────────────┼──────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────┐
│       Docker Container (ECS Fargate, ap-south-1)              │
│                            │                                  │
│  ┌─── WS /ws/voice ───────┤                                        │
│  │    ├─ audio binary → Sarvam STT → language detect              │
│  │    ├─ text → Claude Haiku 4.5 (Bedrock, tool_use loop)         │
│  │    ├─ tool_use → _execute_tool() → service → back to Claude    │
│  │    ├─ Claude response → Sarvam TTS → audio_response            │
│  │    ├─ submit_otp/captcha → form_agent → live browser           │
│  │    └─ form_update → noVNC iframe side-channel                  │
│  │                                                            │
│  ├─── REST /api/v1/* ─── auth, users, chat, docs, schemes, … │
│  │                                                            │
│  ├─── Services Layer                                              │
│  │    ├─ sarvam_service     (Sarvam AI STT saarika:v2 + TTS bulbul:v2) │
│  │    ├─ bedrock_service    (Claude Haiku 4.5 via Bedrock)        │
│  │    ├─ scheme_service     (search, match, eligibility)          │
│  │    ├─ document_service   (upload → OCR → classify → RAG)      │
│  │    ├─ form_agent_service (Playwright HEADFUL on Xvfb :99)      │
│  │    ├─ page_analyzer      (AI field discovery on portals)       │
│  │    └─ translate/s3/dynamodb/…                                  │
│  │                                                            │
│  ├─── Xvfb :99 ──── x11vnc :5900 ──── noVNC :6080           │
│  │    (virtual display)   (VNC)       (WebSocket iframe)      │
│  │                                                            │
│  └─── Data: DynamoDB tables + S3 buckets + local JSON seeds   │
└───────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
Civic Bridge/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── config.py                  # Settings (pydantic-settings, .env)
│   │   ├── routes/
│   │   │   ├── auth.py                # POST /auth/send-otp, verify-otp, register, google
│   │   │   ├── users.py               # GET/PUT /users/me, GET /users/me/dashboard
│   │   │   ├── chat.py                # POST /chat/message, GET conversations
│   │   │   ├── documents.py           # CRUD /documents/ + upload + check-requirements
│   │   │   ├── schemes.py             # GET /schemes/ search/match/eligibility
│   │   │   ├── applications.py        # CRUD /applications/ + automate + OTP + submit + track
│   │   │   ├── translate.py           # POST /translate/text, batch, GET languages
│   │   │   ├── digilocker.py          # DigiLocker OAuth flow
│   │   │   └── ws.py                  # WS /ws/voice — real-time voice + form filling
│   │   ├── services/
│   │   │   ├── sarvam_service.py      # Sarvam AI: STT saarika:v2 + TTS bulbul:v2
│   │   │   ├── bedrock_service.py     # Claude Haiku 4.5 via Bedrock (converse_raw + tool_use)
│   │   │   ├── scheme_service.py      # Scheme discovery + eligibility engine
│   │   │   ├── document_service.py    # Doc pipeline: S3 → Textract → Comprehend → Bedrock
│   │   │   ├── form_agent_service.py  # Live Playwright HEADFUL form filling (noVNC display)
│   │   │   ├── page_analyzer.py       # AI page understanding for govt portals
│   │   │   ├── agent_orchestrator.py  # Document agent wrapper (thin)
│   │   │   ├── translate_service.py   # AWS Translate
│   │   │   ├── dynamodb_service.py    # All DynamoDB CRUD
│   │   │   ├── s3_service.py          # S3 file operations
│   │   │   ├── web_search_service.py  # DuckDuckGo scheme search
│   │   │   ├── auth_service.py        # OTP (AWS SNS) + JWT + Google OAuth
│   │   │   ├── cognito_service.py     # AWS Cognito user pools
│   │   │   ├── comprehend_service.py  # AWS Comprehend NLP (NER, sentiment)
│   │   │   ├── textract_service.py    # AWS Textract OCR
│   │   │   ├── tracking_service.py    # Application status monitoring
│   │   │   ├── notification_service.py # SMS/WhatsApp notifications
│   │   │   └── aws_clients.py         # Shared boto3 client initialization
│   │   ├── models/                    # Pydantic schemas (user, document, scheme, etc.)
│   │   ├── utils/
│   │   │   ├── auth.py                # JWT decode/verify, get_current_user dependency
│   │   │   └── helpers.py             # generate_id(), now_iso(), calculate_age()
│   │   └── static/
│   │       └── form_template.html     # Fallback form template for Playwright
│   ├── data/                          # Local JSON seed data
│   │   ├── schemes_education.json
│   │   ├── schemes_healthcare.json
│   │   ├── schemes_agriculture.json
│   │   └── schemes_welfare.json
│   ├── requirements.txt
│   ├── .env / .env.example
│   ├── Dockerfile                    # Docker: Xvfb + x11vnc + noVNC + FastAPI
│   └── docker/
│       ├── start.sh                  # Container entrypoint
│       └── supervisord.conf          # Process supervisor config
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                   # React entry, BrowserRouter
│   │   ├── App.jsx                    # Route definitions + ProtectedRoute guard
│   │   ├── i18n.js                    # i18next config (22 languages)
│   │   ├── index.css                  # Tailwind + custom styles + animations
│   │   ├── pages/
│   │   │   ├── VoiceChat.jsx          # Main voice AI chat page
│   │   │   ├── Auth.jsx               # Login (OTP + Google OAuth)
│   │   │   ├── SchemesPage.jsx        # Browse/search schemes
│   │   │   ├── SchemeDetailPage.jsx   # Single scheme detail
│   │   │   ├── ProfilePage.jsx        # User profile editor
│   │   │   ├── ApplicationsPage.jsx   # Application history
│   │   │   ├── LanguageSelect.jsx     # Language picker
│   │   │   └── Splash.jsx             # Landing page
│   │   ├── components/
│   │   │   ├── LeftPanel.jsx          # Side menu (Profile, Schemes, Settings)
│   │   │   ├── RightPanel.jsx         # Document manager sidebar
│   │   │   ├── StreamingMessage.jsx   # Typewriter text animation
│   │   │   ├── MarkdownMessage.jsx    # Markdown renderer for AI messages
│   │   │   ├── Background.jsx         # Animated background
│   │   │   ├── Globe.jsx              # 3D globe (Spline)
│   │   │   └── LoadingSkeleton.jsx    # Loading placeholder
│   │   ├── hooks/
│   │   │   └── useElevenLabsCall.js   # ElevenLabs voice + backend WS + client tools
│   │   ├── services/
│   │   │   └── api.js                 # Axios instance + API modules
│   │   └── store/
│   │       └── index.js               # Zustand stores (auth, language, voice)
│   ├── vite.config.js                 # Vite 5, proxy /api → localhost:8000
│   ├── tailwind.config.js
│   └── package.json
│
├── claude.md                          # THIS FILE — project reference
├── design.md
├── requirements.md
├── tasks.md
├── workflow-diagrams.md
└── template.yaml                      # AWS SAM template
```

---

## REST API Endpoints

All routes prefixed with `/api/v1`.

### Auth (`auth.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/send-otp` | Send OTP to phone (Twilio SMS) |
| POST | `/auth/verify-otp` | Verify OTP → JWT token |
| POST | `/auth/register` | Register new user |
| POST | `/auth/google` | Google OAuth login (id_token) |

### Users (`users.py`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update profile |
| GET | `/users/me/dashboard` | Dashboard summary |

### Chat (`chat.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/chat/message` | Send message → multi-agent AI → response |
| GET | `/chat/conversations` | List conversations |
| GET | `/chat/conversations/{id}` | Get conversation |
| DELETE | `/chat/conversations/{id}` | Delete conversation |

### Documents (`documents.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/documents/upload` | Upload + OCR + classify |
| GET | `/documents/` | List user documents |
| GET | `/documents/{id}` | Get document detail |
| DELETE | `/documents/{id}` | Delete document |
| GET | `/documents/{id}/download` | Presigned download URL |
| POST | `/documents/check-requirements` | Check required docs availability |

### Schemes (`schemes.py`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/schemes/` | Search/list schemes |
| GET | `/schemes/categories` | Available categories |
| GET | `/schemes/match` | Profile-based matching |
| GET | `/schemes/{id}` | Scheme details |
| GET | `/schemes/{id}/eligibility` | Eligibility check |

### Applications (`applications.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/applications/start` | Start new application |
| GET | `/applications/` | List user applications |
| GET | `/applications/{id}` | Application details |
| POST | `/applications/{id}/automate` | Start browser automation |
| POST | `/applications/{id}/verify` | Human-in-the-loop verify |
| POST | `/applications/{id}/otp` | Submit OTP |
| POST | `/applications/{id}/captcha` | Submit CAPTCHA |
| POST | `/applications/{id}/submit` | Final submit |
| GET | `/applications/{id}/track` | Track status |

### Translate (`translate.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/translate/text` | Translate text |
| POST | `/translate/batch` | Batch translate |
| GET | `/translate/languages` | Supported languages |

### DigiLocker (`digilocker.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/digilocker/initiate` | Start OAuth flow |
| GET | `/digilocker/callback` | OAuth callback |
| GET | `/digilocker/documents` | Available doc types |

---

## WebSocket Protocol

**Endpoint:** `WS /api/v1/ws/voice?token=<JWT>`

### Client → Server Messages

| type | Fields | Purpose |
|------|--------|------|
| `session_start` | `language`, `conversation_id?` | Init session, load profile |
| `audio_message` | `data` (base64 WebM) | Voice input (JSON variant of binary frame) |
| `text_message` | `data` (string) | Typed text input → Claude → TTS |
| `submit_otp` | `otp` | Relay OTP to live browser |
| `submit_captcha` | `text` | Relay CAPTCHA answer to live browser |
| `session_end` | — | End session, cleanup |

> **Binary frames**: Raw WebM/Opus audio sent as WebSocket binary frames is the preferred path (no JSON wrapping).

### Server → Client Messages

| type | Fields | Purpose |
|------|--------|---------|
| `session_started` | `conversation_id`, `novnc_ready` | Confirms init |
| `transcript` | `role`, `text`, `language` | User or assistant transcript |
| `audio_response` | `data` (base64 WAV), `transcript`, `language` | Sarvam TTS audio to play |
| `status` | `status` | listening / recording / processing / speaking |
| `form_update` | `data` (see below) | Live form progress |
| `form_started` | `scheme_id`, `session_id`, `show_novnc` | Form session confirmed |
| `form_stopped` | — | Form session ended |
| `otp_accepted` | `success` | OTP relay result |
| `captcha_accepted` | `success` | CAPTCHA relay result |
| `error` | `message` | Error |

### `form_update` data shape
```json
{
  "session_id": "...",
  "application_id": "...",
  "scheme_id": "...",
  "status": "filling" | "waiting_otp" | "waiting_captcha" | "started" | "otp_submitted" | "captcha_submitted",
  "waiting_for": null | "otp" | "captcha",
  "current_page": 1,
  "total_pages": 3,
  "fields_filled": 5,
  "total_fields": 18,
  "filled_fields": { "full_name": "Raj Kumar", ... },
  "newly_filled": ["full_name", "dob"],
  "screenshot_base64": "...",
  "screenshot_format": "jpeg",
  "real_portal": true,
  "page_name": "Personal Details",
  "timestamp": "2026-03-07T..."
}
```

---

## Claude Haiku 4.5 Tools (11 tools)

Claude Haiku 4.5 calls these tools natively via Bedrock Converse `toolSpec`.
**Flow:** User speaks → Sarvam STT → Claude with tool definitions → tool_use → `_execute_tool()` in ws.py → result back to Claude → TTS → audio to user.

| Tool | Params | Backend Service | Purpose |
|------|--------|----------------|---------|
| `search_schemes` | `query`, `category` | `scheme_service.search_schemes()` | Search schemes by keyword/category |
| `match_schemes` | — | `scheme_service.match_schemes(profile)` | Auto-match eligible schemes from profile |
| `check_eligibility` | `scheme_id` | `scheme_service.check_eligibility()` | Check eligibility for specific scheme |
| `start_form_filling` | `scheme_id` | `form_agent_service.start_session()` + doc auto-fill | Launch Playwright form filling |
| `get_form_status` | — | `session.get_filled_fields()` etc. | Current form progress |
| `get_missing_fields` | — | `session.get_missing_fields()` | Which fields still need data |
| `provide_field_data` | `field_name`, `value` | `form_agent_service.provide_field()` | Inject field value |
| `stop_form_filling` | — | `form_agent_service.close_session()` | Stop form session |
| `get_user_profile` | — | `session_state["user_profile"]` | User profile summary |
| `get_user_documents` | — | `document_service.get_user_documents()` | List uploaded docs |
| `check_documents` | `scheme_id` | `document_service.check_required_documents()` | Check missing docs for scheme |

---

## Backend Services Reference

### SarvamService (`sarvam_service.py`)
- **Purpose:** Sarvam AI Indian-language STT + TTS — replaces ElevenLabs voice pipeline
- **STT model:** `saarika:v2` — transcribes audio and **auto-detects language** (returns BCP-47 code)
- **TTS model:** `bulbul:v2` — speaks back in the detected/requested language, auto-selects speaker per language
- **Auth:** `api-subscription-key` header
- **Key methods:**
  - `async speech_to_text(audio_bytes, hint_language?)` → `{text, language_code, detected_language}`
  - `async text_to_speech(text, language)` → raw WAV bytes (22050 Hz 16-bit mono)
- **Speaker map:** hi-IN→meera, ta-IN→pavithra, te-IN→arvind, kn-IN→pavithra, bn-IN→amartya, mr-IN→aarohi, en-IN→meera
- **Singleton:** `sarvam_service`

### BedrockService (`bedrock_service.py`)
- **Purpose:** AWS Bedrock LLM gateway — Claude Haiku 4.5 via Converse API
- **Model:** `anthropic.claude-haiku-4-5` (configurable in .env)
- **Auth:** SigV4 (boto3) OR Bearer token if `BEDROCK_API_KEY` is set (httpx)
- **Key methods:** `chat()`, `chat_raw()`, `converse_raw()`, `classify_document()`, `check_eligibility()`, `map_form_fields()`
- **`converse_raw(model_id, messages, system, tools, max_tokens, temperature)`** — returns raw Converse API dict (stopReason, output.message.content). Used by ws.py for tool_use loop.

### SchemeService (`scheme_service.py`)
- **Singleton:** `scheme_service`
- **Data:** DynamoDB `civicbridge-schemes` table, fallback to `data/schemes_*.json`
- **Key methods:**
  - `get_all_schemes()` — all active schemes
  - `get_scheme(scheme_id)` → Optional[Dict]
  - `search_schemes(query, category, state)` → List[Dict]
  - `match_schemes(user_profile)` → List sorted by match_score
  - `check_eligibility(user_profile, scheme_id)` → {eligible, status, match_score, met_criteria, unmet_criteria, missing_info, ai_analysis}

### DocumentService (`document_service.py`)
- **Singleton:** `document_service`
- **Pipeline:** Upload → S3 → Textract OCR → Comprehend NER → Bedrock classification → DynamoDB
- **Key methods:**
  - `process_document(user_id, file, filename)` → saves to S3 + extracts
  - `get_user_documents(user_id)` → List with presigned URLs
  - `get_document_map_for_form(user_id)` → flat dict of extracted fields (Aadhaar, PAN, address, etc.)
  - `check_required_documents(user_id, required_docs)` → {available, missing, all_available}
  - `get_user_document_context(user_id)` → RAG context string for AI

### FormAgentService (`form_agent_service.py`)
- **Singleton:** `form_agent_service`
- **Session class:** `FormFillingSession`
- **Playwright:** Sync API in `ThreadPoolExecutor(max_workers=1)` to bypass Windows event loop subprocess issue
- **Key session attributes:**
  - `collected_fields: Dict[str, str]` — filled field values
  - `required_fields: List[Dict]` — field configs with selectors
  - `total_fields: int`
  - `waiting_for: Optional[str]` — `None` | `'otp'` | `'captcha'`
  - `current_page / total_pages`
  - `_on_real_portal: bool` — True when on actual govt portal
  - `_page_fields_cache: List[Dict]` — AI-discovered fields
- **Key session methods:**
  - `start(user_data)` — launch browser, discover fields, pre-fill from profile
  - `on_conversation_text(role, text)` — feed transcript → AI extraction → browser fill
  - `get_missing_fields()` → List[str] of unfilled field labels
  - `get_filled_fields()` → List[str] of filled field labels
  - `submit_otp(otp)` / `submit_captcha(text)` — relay to browser
  - `close()` — stop browser + cleanup
- **CDP Screencast:** `_start_screencast()` → `Page.screencastFrame` at ~5 FPS for live browser streaming
- **Micro-screenshots:** During fill operations — scroll, highlight (cyan outline), char-by-char typing, screenshot after each field
- **Portal URL resolution:** `_resolve_portal_url()` → checks form_config → scheme record → seed data JSON
- **Browser strategy:** Try real portal first → fallback to `static/form_template.html`

### PageAnalyzer (`page_analyzer.py`)
- **Purpose:** AI-driven form field discovery on unknown govt portals
- **Key methods:**
  - `extract_page_html(page)` — get cleaned HTML from Playwright page
  - `analyze_page(page)` → {fields, has_otp, has_captcha, login_required}
  - `map_data_to_fields(data, fields)` → {mappings: [{selector, value, type}]}
  - `find_next_button(page)` → selector string or None

### AgentOrchestrator (`agent_orchestrator.py`)
- **Singleton:** `orchestrator`
- **Architecture:** Conversation Agent runs **instantly** (Llama 3 70B). Research/Form/Document agents run in background (fire-and-forget). Ensures <1s voice replies.
- **Key method:** `process(user_message, history, profile, language, conversation_id, document_context, form_context)` → {response, intent, agents_used, form_update}
- **Web search:** Auto-detects scheme discovery intent → DuckDuckGo → passes results to AI

---

## Frontend Key Components

### VoiceChat.jsx (main page)
- Uses `useElevenLabsCall` hook for voice + form filling
- State: `inCall`, `status`, `messages[]`, `formInfo`, `formScreenshot`, `interactionPrompt`
- Live browser viewport: shows form screenshots with scanline animation
- OTP/CAPTCHA modals when form agent requests user input
- Text input field for typing (sends to both ElevenLabs + backend)

### useElevenLabsCall.js (primary hook)
- **ElevenLabs:** Agent ID `agent_7601kk4db73hey2a3gc5e9jxemqd`, WebRTC via `@elevenlabs/react`
- **Backend WS:** Connects to `/api/v1/ws/voice?token=...`
- **Client tools:** 11 tools registered — sends `tool_call` WS messages, resolves via `tool_result`
- **`callBackendTool(toolName, params)`** — Promise with 15s timeout
- **`pendingToolCallsRef`** — `{ callId: { resolve, reject, timer } }`
- **Exports:** `startCall`, `endCall`, `sendTextMessage`, `startFormSession`, `submitOtp`, `submitCaptcha`, `skipResponse`, etc.

### State Management (Zustand)
- `useAuthStore` — `user`, `token`, `isAuthenticated`, `login()`, `logout()`
- `useLanguageStore` — `language`, `languageName`, `setLanguage()`
- `useVoiceStore` — `status`, `caption`, `userDetails`, `screenshot`, `setStatus()`, etc.

### API Layer (services/api.js)
- Axios instance at `/api/v1` with JWT Bearer token interceptor
- Auto-redirects to `/auth` on 401
- Modules: `authAPI`, `userAPI`, `chatAPI`, `documentsAPI`, `schemesAPI`, `applicationsAPI`

---

## Environment Variables

```env
# Required
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
JWT_SECRET=<strong-random-string>

# DynamoDB Tables
USERS_TABLE=civicbridge-users
DOCUMENTS_TABLE=civicbridge-documents
APPLICATIONS_TABLE=civicbridge-applications
SCHEMES_TABLE=civicbridge-schemes
CONVERSATIONS_TABLE=civicbridge-conversations

# S3 Buckets
DOCUMENTS_BUCKET=civicbridge-documents
SCREENSHOTS_BUCKET=civicbridge-screenshots

# AI Model
BEDROCK_MODEL_ID=meta.llama3-70b-instruct-v1:0

# Optional
TWILIO_ACCOUNT_SID=...          # SMS OTP
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
COGNITO_USER_POOL_ID=...        # Google OAuth
COGNITO_CLIENT_ID=...
COGNITO_CLIENT_SECRET=...
COGNITO_DOMAIN=...
GOOGLE_CLIENT_ID=...            # Direct Google OAuth fallback
GOOGLE_CLIENT_SECRET=...
```

---

## Common Issues & Fixes

### Playwright won't launch on Windows (NotImplementedError)
- **Cause:** `uvicorn --reload` uses `asyncio.ProactorEventLoop` which doesn't support `subprocess_exec`
- **Fix:** Use Playwright **sync API** in a `ThreadPoolExecutor(max_workers=1)`. Never use `async_playwright` with uvicorn on Windows.
- **Commit:** `3b1f813`

### Duplicate AI responses when ElevenLabs is active
- **Cause:** User transcript was being sent to both ElevenLabs (which generates AI response) AND the backend orchestrator (which generates a second AI response)
- **Fix:** Added `voice_transcript` message type — backend feeds form agent only, does NOT run AI pipeline. ElevenLabs handles all AI reasoning + speech.

### Form agent not triggering from text chat
- **Cause:** Form start detection only happened in voice pipeline, not text pipeline
- **Fix:** Added form trigger detection in `_handle_text_message()` (commit `95e1f64`, `88e2581`)

### CDP screencast not starting
- **Cause:** Headless Chromium may not support CDP in all configurations
- **Fix:** `_start_screencast()` catches errors gracefully and falls back to 2-second periodic screenshots via `_live_frame_streamer()`

### `get_form_status` returning wrong data
- **Cause:** Was using `form_session.filled_fields` (doesn't exist) instead of `form_session.collected_fields`
- **Fix:** Use correct attributes: `collected_fields` (dict), `get_missing_fields()` (method), `get_filled_fields()` (method), `waiting_for`, `total_fields`
- **Commit:** `0881815`

---

## Git History (recent)

```
0881815 feat: enhance agent workflow with form filling tools and document auto-fill
ce6c7fe feat: add ElevenLabs client tools for backend action workflows
7e660b8 feat: live browser streaming with CDP screencast + micro-screenshots
f67c017 feat: integrate ElevenLabs Conversational AI for voice chat
3b1f813 fix: use Playwright sync API in dedicated thread to bypass Windows subprocess issue
500d423 fix: Playwright browser not launching on Windows
88e2581 fix: form filling now triggers reliably from text chat
2fd0c39 fix: prevent duplicate user messages in text chat
95e1f64 fix: enable form filling from text chat (not just voice)
c78a525 fix: 3 blocking bugs in form filling pipeline
64e79fa feat: real-portal form filling with AI page analysis and landscape browser view
b5b1a84 Voice-driven form filling: background agent, live projection, AI field prompting
50e2e3b fix: speech fragmentation, serialized AI calls, key-points TTS
```

---

## Key Patterns & Conventions

### Backend
- **Singletons:** All services are module-level singletons (e.g., `scheme_service = SchemeService()`)
- **Async + sync Playwright:** All Playwright calls go through `_pw_executor` (ThreadPoolExecutor). Use `await loop.run_in_executor(_pw_executor, sync_fn)` to call sync Playwright from async handlers.
- **WebSocket state:** Each WS connection gets a `session_state` dict with: `user_id`, `user_profile`, `conversation_id`, `language`, `form_session`, `conversation_history`, `scheme_id`, etc.
- **Error handling:** Services return dicts with error fields (not exceptions) for graceful degradation. WS sends `{"type": "error", "message": ...}` on failures.

### Frontend
- **Hook pattern:** `useElevenLabsCall` (file kept for import compat) manages push-to-talk MediaRecorder + backend WS. Returns `startCall`, `endCall`, `toggleRecording`, `sendTextMessage`, etc.
- **Push-to-talk:** `startRecording()` → MediaRecorder captures WebM/Opus → `stopRecording()` → binary WS frame → backend STT.
- **Audio playback:** Backend sends `audio_response` with base64 WAV → `new Audio("data:audio/wav;base64,...").play()`.
- **Form updates:** `onFormUpdate` callback receives `form_update.data` → VoiceChat.jsx updates `formInfo` + shows noVNC iframe.

### Data Flow (Voice Chat)
```
User speaks → MediaRecorder (WebM) → WS binary frame
                     ↓
              ws.py: Sarvam STT → detected language
                     ↓
              Claude Haiku 4.5 (tool_use loop)
                     ↓ if tool needed
              _execute_tool() → service → result string → back to Claude
                     ↓
              Claude final response text
                     ↓
              Sarvam TTS (in detected language) → WAV bytes
                     ↓
              WS audio_response (base64 WAV) → frontend plays audio
```

### Data Flow (Form Filling)
```
User: "Fill the PM Kisan form" → Claude tool_use: start_form_filling
                                                              ↓
                                   FormAgentService.start_session()
                                                              ↓
                                   Playwright fills browser (char-by-char)
                                                              ↓
                                   noVNC → user watches live in iframe
                                   WS form_update → progress bar
```
