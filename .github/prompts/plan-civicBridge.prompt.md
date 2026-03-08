# CivicBridge — Speech-to-Speech + Live Form Agent Plan

## Overview

Replace the 3-step voice pipeline (STT → LLM → TTS) with Amazon Nova Sonic speech-to-speech model and add a background AI agent that watches conversations, fills government forms via Playwright in real-time, and projects the live form filling on the chat page.

---

## Architecture

### Current Pipeline (Before)
```
Microphone → AWS Transcribe (STT) → Bedrock Llama3 (LLM) → AWS Polly (TTS) → Speaker
```

### New Pipeline (After)
```
Microphone → WebSocket → Amazon Nova Sonic (Speech-to-Speech) → WebSocket → Speaker
                              ↓ transcript callback
                     Form Agent (Bedrock + Playwright)
                              ↓ screenshot + field updates
                     Frontend Live Projection
```

---

## Components

### Backend

| File | Status | Purpose |
|------|--------|---------|
| `backend/app/services/nova_sonic_service.py` | ✅ Created | Nova Sonic bidirectional streaming — `NovaSonicSession` + `NovaSonicService` |
| `backend/app/services/form_agent_service.py` | ✅ Created | Live form-filling agent — watches transcripts, extracts fields via AI, fills Playwright forms, streams screenshots |
| `backend/app/routes/ws.py` | ✅ Created | WebSocket endpoint `/ws/voice` — connects Nova Sonic + form agent + frontend |
| `backend/app/services/bedrock_service.py` | ✅ Modified | Added `chat_raw()` method for form agent field extraction |
| `backend/app/utils/auth.py` | ✅ Modified | Added `decode_token_unsafe()` for WebSocket auth |
| `backend/app/main.py` | ✅ Modified | Registered WebSocket router |

### Frontend

| File | Status | Purpose |
|------|--------|---------|
| `frontend/src/hooks/useNovaSonicCall.js` | ✅ Created | WebSocket voice hook — PCM streaming, audio playback, form update handling |
| `frontend/src/pages/VoiceChat.jsx` | ✅ Modified | Switched to new hook, added live screenshot display with browser chrome |
| `frontend/vite.config.js` | ✅ Modified | Added `ws: true` to proxy for WebSocket passthrough |
| `frontend/src/hooks/useVoiceCall.js` | Unchanged | Kept as REST-based fallback |

---

## Technical Details

### Nova Sonic Configuration
- **Model**: `amazon.nova-sonic-v1:0`
- **API**: `invoke_model_with_bidirectional_stream`
- **Input Audio**: PCM 16-bit, 16kHz, mono
- **Output Audio**: PCM 16-bit, 24kHz, mono
- **VAD**: Server-side, 500ms silence threshold
- **Languages**: en, hi, ta, te, bn, mr, gu, kn, ml, pa

### WebSocket Protocol
**Client → Server:**
- `session_start` — Initialize Nova Sonic session + form agent
- `audio_chunk` — Stream PCM audio (base64)
- `text_message` — Send text via orchestrator
- `session_end` — Cleanup

**Server → Client:**
- `audio_chunk` — Nova Sonic PCM response (base64)
- `transcript` — User/assistant transcript text
- `status` — Connection status updates
- `form_update` — Screenshot + filled fields from form agent
- `session_started` — Confirmation
- `error` — Error details

### Form Agent Flow
1. Receives transcript from Nova Sonic callback
2. AI extracts form fields via `bedrock_service.chat_raw()` (JSON output)
3. Playwright fills fields in headless Chromium
4. Takes screenshot → base64
5. Sends `form_update` event via WebSocket callback
6. Frontend displays screenshot with browser chrome + highlights newly filled fields

### Fallback Behavior
If Nova Sonic is unavailable (older boto3 / region unsupported), the system automatically falls back to Transcribe + Llama3 + Polly but over WebSocket for lower latency.

---

## Verification

- [x] Frontend build: 137 modules, 0 errors
- [x] Backend imports: all 5 new components verified
- [x] WebSocket router registered in main.py
- [x] Vite proxy configured for WebSocket

---

## Prerequisites for Testing

1. **Restart backend**: New routes require server restart
   ```
   cd backend
   cmd /c "..\.venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
   ```

2. **Restart frontend**: Vite config changed
   ```
   cd frontend
   npx vite --host
   ```

3. **Install Playwright** (for live form filling with screenshots):
   ```
   pip install playwright
   python -m playwright install chromium
   ```
   Without Playwright, the form agent runs in simulation mode (field tracking only, no screenshots).

---

## Known Limitations

- Nova Sonic availability depends on boto3 version and AWS region support (ap-south-1)
- Form agent field extraction quality depends on Bedrock model's conversational text → structured JSON parsing
- S3 `get_presigned_url()` receives unexpected `expires_in` kwarg (pre-existing bug, not yet fixed)
- ScriptProcessor API used for PCM capture is deprecated; future migration to AudioWorklet recommended

---

## Next Steps

- [ ] End-to-end testing with live microphone
- [ ] Validate Nova Sonic streaming in ap-south-1 region
- [ ] Test form agent with real government form URLs
- [ ] Add AudioWorklet for PCM capture (replace deprecated ScriptProcessor)
- [ ] Fix S3 presigned URL `expires_in` bug
- [ ] Add reconnection logic for WebSocket drops
- [ ] Performance tuning: audio buffer sizes, screenshot frequency
