# CivicBridge — Project Reference

> **Last updated:** 2026-03-07 (commit `0881815`)
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

- **Voice AI Chat** — ElevenLabs Conversational AI (WebRTC) for natural speech interaction
- **Scheme Discovery** — Search, match, and check eligibility for government schemes
- **Live Form Filling** — Playwright browser automation fills real government portal forms
- **Document Management** — Upload, OCR (Textract), classify (Bedrock), and auto-extract data
- **Multi-language** — 22 Indian languages via AWS Translate, Polly, Transcribe
- **Google OAuth + OTP Auth** — Cognito federation + phone OTP login

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                   │
│  VoiceChat.jsx ─── useElevenLabsCall.js ─── ElevenLabs WebRTC│
│       │                    │                                  │
│       │              Backend WebSocket                        │
│       └──── REST API ──────┤                                  │
└────────────────────────────┼──────────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────────┐
│              Backend (FastAPI + uvicorn)                       │
│                            │                                  │
│  ┌─── WS /ws/voice ───────┤                                  │
│  │    ├─ text_message → AgentOrchestrator → Bedrock AI → TTS  │
│  │    ├─ voice_transcript → FormAgent (field extraction only) │
│  │    ├─ tool_call → _dispatch_tool() → service → tool_result │
│  │    ├─ audio_chunk → Nova Sonic / fallback STT pipeline     │
│  │    ├─ start_form → FormAgentService → Playwright           │
│  │    └─ submit_otp / submit_captcha → live browser           │
│  │                                                            │
│  ├─── REST /api/v1/* ─── auth, users, chat, voice, docs, …  │
│  │                                                            │
│  ├─── Services Layer                                          │
│  │    ├─ bedrock_service    (Llama 3 70B via Converse API)    │
│  │    ├─ scheme_service     (search, match, eligibility)      │
│  │    ├─ document_service   (upload → OCR → classify → RAG)   │
│  │    ├─ form_agent_service (Playwright live form filling)     │
│  │    ├─ page_analyzer      (AI field discovery on portals)   │
│  │    ├─ agent_orchestrator (multi-agent coordinator)          │
│  │    └─ polly/transcribe/translate/s3/dynamodb/…             │
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
│   │   │   ├── voice.py               # POST /voice/process (audio→STT→AI→TTS)
│   │   │   ├── documents.py           # CRUD /documents/ + upload + check-requirements
│   │   │   ├── schemes.py             # GET /schemes/ search/match/eligibility
│   │   │   ├── applications.py        # CRUD /applications/ + automate + OTP + submit + track
│   │   │   ├── translate.py           # POST /translate/text, batch, GET languages
│   │   │   ├── digilocker.py          # DigiLocker OAuth flow
│   │   │   └── ws.py                  # WS /ws/voice — real-time voice + form filling
│   │   ├── services/
│   │   │   ├── bedrock_service.py     # AWS Bedrock LLM (Llama 3 70B)
│   │   │   ├── scheme_service.py      # Scheme discovery + eligibility engine
│   │   │   ├── document_service.py    # Doc pipeline: S3 → Textract → Comprehend → Bedrock
│   │   │   ├── form_agent_service.py  # Live Playwright form filling agent
│   │   │   ├── page_analyzer.py       # AI page understanding for govt portals
│   │   │   ├── agent_orchestrator.py  # Multi-agent: Convo (instant) + Research/Form (bg)
│   │   │   ├── nova_sonic_service.py  # AWS Nova Sonic speech-to-speech
│   │   │   ├── polly_service.py       # AWS Polly TTS (Kajal neural voice)
│   │   │   ├── transcribe_service.py  # AWS Transcribe STT
│   │   │   ├── translate_service.py   # AWS Translate
│   │   │   ├── dynamodb_service.py    # All DynamoDB CRUD
│   │   │   ├── s3_service.py          # S3 file operations
│   │   │   ├── web_search_service.py  # DuckDuckGo scheme search
│   │   │   ├── auth_service.py        # OTP + JWT + Google OAuth
│   │   │   ├── cognito_service.py     # AWS Cognito user pools
│   │   │   ├── comprehend_service.py  # AWS Comprehend NLP (NER, sentiment)
│   │   │   ├── textract_service.py    # AWS Textract OCR
│   │   │   ├── tracking_service.py    # Application status monitoring
│   │   │   ├── notification_service.py # SMS/WhatsApp notifications
│   │   │   ├── automation_service.py  # Headless browser automation (legacy)
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
│   └── lambda_handler.py             # AWS Lambda entry (mangum)
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
│   │   │   ├── useElevenLabsCall.js   # PRIMARY: ElevenLabs voice + backend WS + client tools
│   │   │   ├── useNovaSonicCall.js    # Nova Sonic WS streaming (legacy)
│   │   │   └── useVoiceCall.js        # REST-based voice (legacy)
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

### Voice (`voice.py`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/voice/process` | Audio → STT → AI → TTS → audio response |

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
|------|--------|---------|
| `session_start` | `language`, `conversation_id?`, `scheme_id?` | Init session, load profile, start Nova Sonic |
| `audio_chunk` | `data` (base64 PCM) | Stream audio to Nova Sonic or fallback STT |
| `text_message` | `data` (string) | Text input → orchestrator → AI → TTS |
| `voice_transcript` | `data` (string) | ElevenLabs user transcript → form agent only (no backend AI) |
| `assistant_message` | `data` (string) | ElevenLabs AI response → form agent context |
| `tool_call` | `call_id`, `tool`, `params` | Client tool dispatch from ElevenLabs agent |
| `start_form` | `scheme_id` | Explicitly start form filling session |
| `submit_otp` | `otp` | Relay OTP to live browser |
| `submit_captcha` | `text` | Relay CAPTCHA answer to live browser |
| `session_end` | — | End session, cleanup |

### Server → Client Messages

| type | Fields | Purpose |
|------|--------|---------|
| `session_started` | `conversation_id`, `nova_sonic`, `form_session?` | Confirms init |
| `audio_chunk` | `data`, `format` | AI speech audio (base64 mp3/pcm) |
| `transcript` | `role`, `text` | User or assistant transcript |
| `status` | `status` | listening / speaking / processing / idle |
| `form_update` | `data` (see below) | Live form progress + screenshot |
| `form_started` | `scheme_id`, `session_id` | Form session confirmed |
| `tool_result` | `call_id`, `result` | Response to tool_call |
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

## ElevenLabs Client Tools (11 tools)

The ElevenLabs voice agent triggers backend actions via client tools.
**Flow:** Agent calls tool → `useElevenLabsCall.js` sends `tool_call` WS → backend `_dispatch_tool()` → returns `tool_result` → agent speaks result.

| Tool | Params | Backend Service | Purpose |
|------|--------|----------------|---------|
| `search_schemes` | `query`, `category` | `scheme_service.search_schemes()` | Search schemes by keyword/category |
| `match_schemes` | — | `scheme_service.match_schemes(profile)` | Auto-match eligible schemes from profile |
| `check_eligibility` | `scheme_id` | `scheme_service.check_eligibility()` | Check eligibility for specific scheme |
| `start_form_filling` | `scheme_id` | `_start_form_agent()` + doc auto-fill | Launch Playwright form filling |
| `get_form_status` | — | `session.get_filled_fields()` etc. | Current form progress |
| `get_missing_fields` | — | `session.get_missing_fields()` | Which fields still need data |
| `provide_field_data` | `field_name`, `value` | `session.collected_fields` + browser fill | Inject field value |
| `stop_form_filling` | — | `session.close()` | Stop form session |
| `get_user_profile` | — | `state["user_profile"]` | User profile summary |
| `get_user_documents` | — | `document_service.get_user_documents()` | List uploaded docs |
| `check_documents` | `scheme_id` | `document_service.check_required_documents()` | Check missing docs for scheme |

---

## Backend Services Reference

### BedrockService (`bedrock_service.py`)
- **Purpose:** AWS Bedrock LLM gateway — Llama 3 70B via Converse API
- **Model:** `meta.llama3-70b-instruct-v1:0` (configurable in .env)
- **Key methods:** `chat()`, `chat_raw()`, `classify_document()`, `check_eligibility()`, `map_form_fields()`, `generate_form_summary()`, `analyze_screenshot()`

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

### NovaSonicService (`nova_sonic_service.py`)
- **Purpose:** Amazon Nova Sonic speech-to-speech streaming
- **Status:** Available but ElevenLabs is now primary voice engine
- Used as fallback when `session_start` message triggers Nova Sonic path

### PollyService / TranscribeService / TranslateService
- AWS managed services for TTS, STT, translation
- Used in fallback voice pipeline (when not using ElevenLabs)

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
- Modules: `authAPI`, `userAPI`, `chatAPI`, `voiceAPI`, `documentsAPI`, `schemesAPI`, `applicationsAPI`

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
- **Hook pattern:** `useElevenLabsCall` manages both ElevenLabs (voice) and backend WS (actions). Returns `startCall`, `endCall`, `sendTextMessage`, etc.
- **Client tools:** Each tool is `async (params) => string`. Sends WS tool_call, waits for tool_result (15s timeout), returns result string for agent to speak.
- **Form updates:** `onFormUpdate` callback receives `form_update.data` → VoiceChat.jsx updates `formInfo` + `formScreenshot` state.

### Data Flow (Voice Chat)
```
User speaks → ElevenLabs agent (STT + AI reasoning + TTS) → speaks back
                     ↓ client tool call (if action needed)
              useElevenLabsCall.js → WS tool_call → backend _dispatch_tool()
                     ↓                                    ↓
              WS tool_result ← ─────────────────── service result (string)
                     ↓
              Agent receives string → speaks result to user
```

### Data Flow (Form Filling)
```
User speaks field data → ElevenLabs → voice_transcript → FormFillingSession
                                                              ↓
                                   AI extraction (Bedrock) → collected_fields updated
                                                              ↓
                                   Playwright fills field in browser (char-by-char, cyan highlight)
                                                              ↓
                                   CDP screencast frame → WS form_update → frontend live viewport
```
