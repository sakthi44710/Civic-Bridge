4]# CivicBridge — Project Reference

> **Last updated:** 2026-03-08 20:45 IST (bulbul:v3 Ishita 8kHz, config cleanup — no SMART_MODEL/Twilio, VoiceChat.jsx stale code removed)
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

- **Voice AI Chat** — Sarvam AI (saarika:v2 STT + bulbul:v3 TTS, Ishita speaker, 8 kHz) + Claude Haiku 4.5 (Bedrock) for full voice pipeline
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
│  │    ├─ sarvam_service     (Sarvam AI STT saarika:v2 + TTS bulbul:v3, Ishita) │
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
│   │   │   ├── sarvam_service.py      # Sarvam AI: STT saarika:v2 + TTS bulbul:v3, Ishita 8kHz
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
│   │   │   └── useElevenLabsCall.js   # Push-to-talk MediaRecorder + backend WS (no ElevenLabs)
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
| POST | `/auth/send-otp` | Send OTP to phone (AWS SNS) |
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
- **TTS model:** `bulbul:v3` — speaks back in the detected/requested language; Ishita speaker; 8000 Hz (low frequency)
- **Auth:** `api-subscription-key` header
- **Initialization:** Call `sarvam_service.init(api_key)` on startup (done in `main.py` startup event). Creates shared `httpx.AsyncClient` with keep-alive.
- **Key methods:**
  - `init(api_key)` — initialise shared httpx client (called once on startup)
  - `async speech_to_text(audio_bytes, hint_language?)` → `{text, language_code, detected_language}`
  - `async text_to_speech(text, language)` → raw WAV bytes
  - `async text_to_speech_sentences(text, language)` → async generator yielding `(sentence, wav_bytes)` per sentence — used by ws.py for streaming
  - `async close()` — shutdown client on app teardown
- **Speaker:** `ishita` — fixed for all languages; model `bulbul:v3`; `speech_sample_rate=8000` Hz
- **Singleton:** `sarvam_service = SarvamService()` — call `sarvam_service.init(key)` on startup

### BedrockService (`bedrock_service.py`)
- **Purpose:** AWS Bedrock LLM gateway — Claude Haiku 4.5 via Converse API
- **Model:** `anthropic.claude-haiku-4-5` — set via `BEDROCK_MODEL_ID` in .env (single model for all tasks; `BEDROCK_SMART_MODEL` removed)
- **Auth:** SigV4 (boto3) OR Bearer token if `BEDROCK_API_KEY` is set (httpx fallback)
- **Key methods:** `chat()`, `converse_raw()`, `classify_document()`, `check_eligibility()`, `map_form_fields()`
- **`converse_raw(model_id, messages, system, tools, max_tokens=300, temperature=0.3)`** — returns raw Converse API dict (stopReason, output.message.content). Used by ws.py for tool_use loop. Bearer-token path tries httpx first, falls back to boto3 SigV4.

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
  - `_page_fields_cache: List[Dict]` — AI-discovered fields
- **Key session methods:**
  - `start(user_data)` — launch browser, discover fields, pre-fill from profile
  - `on_conversation_text(role, text)` — feed transcript → AI extraction → browser fill
  - `get_missing_fields()` → List[str] of unfilled field labels
  - `get_filled_fields()` → List[str] of filled field labels
  - `submit_otp(otp)` / `submit_captcha(text)` — relay to browser
  - `close()` — stop browser + cleanup
- **Live browser:** noVNC streams Xvfb :99 directly — no screenshots in WebSocket
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
- **Role:** Thin wrapper — only handles document processing background tasks. All conversation is owned by Claude Haiku 4.5 in `ws.py` tool_use loop.
- **Key method:** `process_document_background(user_id, document_id)` — runs document pipeline asynchronously after upload.

---

## Frontend Key Components

### VoiceChat.jsx (main page)
- Uses `useElevenLabsCall` hook for push-to-talk voice + form filling
- State: `inCall`, `status`, `isRecording`, `messages[]`, `formInfo`, `textInput`, OTP/CAPTCHA state
- **Push-to-talk:** Tap mic button to record, tap again to stop + send audio to backend
- **Text input row:** Type and submit while in a session; sends `text_message` WS frame
- Live browser viewport: noVNC `<iframe>` shown when form filling starts
- OTP/CAPTCHA modals overlay the live browser when agent requests user input

### useElevenLabsCall.js (primary hook — name kept for import compat)
- **No ElevenLabs dependency** — uses browser MediaRecorder + WebSocket only
- **Push-to-talk:** `startRecording()` → MediaRecorder (WebM/Opus) → `stopRecording()` → binary WS frame
- **Audio playback:** Receives `audio_response` (base64 WAV) → enqueued in `audioQueueRef` → plays sequentially via `_playNextAudio()`
- **Backend WS:** Connects to `/api/v1/ws/voice?token=...`
- **Exports:** `startCall`, `endCall`, `toggleRecording`, `startRecording`, `stopRecording`, `sendTextMessage`, `submitOtp`, `submitCaptcha`

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

# AI — Claude Haiku 4.5 via Bedrock (voice + all tasks)
BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5
# Bearer-token auth (use if IAM/SigV4 not working)
BEDROCK_API_KEY=ABSK...
BEDROCK_API_REGION=ap-south-1

# Sarvam AI — STT + TTS for Indian languages (sarvam.ai)
SARVAM_API_KEY=sk_...

# Live browser (noVNC)
DISPLAY=:99
NOVNC_PORT=6080
VNC_PORT=5900

# Auth (Google OAuth via Cognito + OTP via AWS SNS)
SNS_SENDER_ID=CivicBridge
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

### Duplicate AI responses (historical — ElevenLabs era, now removed)
- ElevenLabs fully removed; all voice AI is now Sarvam STT + Claude Haiku 4.5 + Sarvam TTS in ws.py.

### Form agent not triggering from text chat
- **Cause:** Form start detection only happened in voice pipeline, not text pipeline
- **Fix:** Added form trigger detection in `_handle_text()` (ws.py)

### `get_form_status` returning wrong data
- **Cause:** Was using `form_session.filled_fields` (doesn't exist) instead of `form_session.collected_fields`
- **Fix:** Use correct attributes: `collected_fields` (dict), `get_missing_fields()` (method), `get_filled_fields()` (method), `waiting_for`, `total_fields`
- **Commit:** `0881815`

---

## Git History (recent)

```
4b2028d refactor: clean up stale config/code from migration prompt
3b2c785 perf: speed-optimize voice pipeline + audit fixes
732492c feat: replace ElevenLabs with Sarvam AI STT/TTS + Claude Haiku 4.5 (Bedrock)
88dd555 feat: noVNC live browser + Claude Sonnet 4.6 + SNS OTP + clean architecture
f8d59f7 refactor: remove Polly, Transcribe, Nova Sonic — use ElevenLabs only for voice
343ce3e docs: add claude.md project reference for AI assistant debugging and memory
0881815 feat: enhance agent workflow with form filling tools and document auto-fill
ce6c7fe feat: add ElevenLabs client tools for backend action workflows
3b1f813 fix: use Playwright sync API in dedicated thread to bypass Windows subprocess issue
```

---

## Key Patterns & Conventions

### Backend
- **Singletons:** All services are module-level singletons (e.g., `scheme_service = SchemeService()`)
- **Async + sync Playwright:** All Playwright calls go through `_pw_executor` (ThreadPoolExecutor). Use `await loop.run_in_executor(_pw_executor, sync_fn)` to call sync Playwright from async handlers.
- **WebSocket state:** Each WS connection gets a `session_state` dict with: `user_id`, `user_profile`, `conversation_id`, `language`, `conversation_history`, `_doc_context` (cached).
- **Background form start:** `start_form_filling` tool fires `asyncio.create_task(_start_form_background(...))` so Claude can respond to user immediately without waiting for browser launch.
- **Sentence streaming TTS:** `sarvam_service.text_to_speech_sentences()` async generator splits Claude response by sentence boundary `[.!?।]`, calls TTS per sentence, streams each `audio_response` WS frame as it's ready. First audio plays ~400ms after Claude responds.
- **httpx keep-alive:** `SarvamService._get_client()` returns a shared `httpx.AsyncClient` — avoids TCP handshake overhead on every STT/TTS call.
- **Claude speed settings:** `max_tokens=300`, `temperature=0.3` — 30-40% faster responses, appropriate for short voice replies.
- **Doc context cache:** `session_state["_doc_context"]` cached per WS session — no repeated DynamoDB reads per turn.
- **Error handling:** Services return dicts with error fields (not exceptions) for graceful degradation. WS sends `{"type": "error", "message": ...}` on failures.

### Frontend
- **Hook pattern:** `useElevenLabsCall` (file kept for import compat) manages push-to-talk MediaRecorder + backend WS. Returns `startCall`, `endCall`, `toggleRecording`, `sendTextMessage`, etc.
- **Push-to-talk:** `startRecording()` → MediaRecorder captures WebM/Opus → `stopRecording()` → binary WS frame → backend STT.
- **Audio playback queue:** `audioQueueRef` buffers incoming sentence WAV chunks; `_playNextAudio()` plays them sequentially so streamed sentences don't overlap.
- **Form updates:** `onFormUpdate` callback receives `form_update.data` → VoiceChat.jsx updates `formInfo` + shows noVNC iframe.

### Data Flow (Voice Chat)
```
User speaks → MediaRecorder (WebM) → WS binary frame
                     ↓
              ws.py: Sarvam STT → detected language     (~400-800ms)
                     ↓
              send transcript to frontend               ← immediate
                     ↓
              Claude Haiku 4.5 (tool_use loop)          (~300-600ms)
                     ↓ if tool needed
              _execute_tool() → service → result string → back to Claude
              (form tools fired as background task — non-blocking)
                     ↓
              Claude final response text
                     ↓
              sentence-split → Sarvam TTS per sentence  (~200-400ms/sentence)
                     ↓
              WS audio_response per sentence → frontend queues + plays
              (first sentence plays while rest are TTS-ing)
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
