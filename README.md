# CivicBridge

> AI-powered platform helping Indian citizens discover and apply for government welfare schemes through voice-first, multilingual interactions.

[![Live Demo](https://img.shields.io/badge/Live-civicbridge.in-blue)](https://civicbridge.in)

---

## Features

- **Voice AI Chat** — Speak in any of 22 Indian languages; the AI understands, responds, and speaks back in the same language (Sarvam AI STT/TTS + Claude Sonnet on Bedrock)
- **Scheme Discovery** — Search, match, and check eligibility for 50+ government welfare schemes
- **Live Form Filling** — An autonomous AI agent opens a real browser, navigates government portals, and fills application forms — you watch it live
- **Document Intelligence** — Upload documents → OCR (Textract) → auto-classify → extract Aadhaar, PAN, income, etc. for form filling
- **OTP & CAPTCHA Handling** — The AI pauses when it encounters OTP/CAPTCHA, asks you to solve it, then resumes
- **Multi-language** — 22 Indian languages with auto-detection and code-mixing support

---

## Architecture

```
Frontend (React + Vite + TypeScript)
  ├── Voice Chat UI (push-to-talk + text input)
  ├── Live Browser Viewport (screenshot stream)
  ├── Scheme Browser, Profile, Documents
  └── WebSocket ↔ Backend

Backend (FastAPI + Python)
  ├── WebSocket /ws/voice — real-time voice + AI agent pipeline
  ├── REST API /api/v1/* — auth, users, schemes, documents, applications
  ├── Sarvam AI (STT saarika:v2 + TTS bulbul:v3)
  ├── Claude Sonnet 4.6 (AWS Bedrock) — LLM with tool use
  ├── Playwright (headful browser on Xvfb) — autonomous form filling
  └── DynamoDB + S3 + Textract + Comprehend

Infrastructure (AWS)
  ├── ECS Fargate — backend container (FastAPI + Xvfb + VNC)
  ├── S3 + CloudFront — frontend static hosting
  ├── DynamoDB — users, documents, schemes, applications, conversations
  ├── S3 — document storage + screenshots
  └── Bedrock, Textract, Comprehend, Translate, SNS
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 5, Tailwind CSS 4, Zustand, Framer Motion |
| Backend | Python 3.12, FastAPI, Playwright, Pydantic |
| AI/LLM | Claude Sonnet 4.6 (Bedrock), Sarvam AI (Indian STT/TTS) |
| Database | Amazon DynamoDB |
| Storage | Amazon S3 |
| OCR | Amazon Textract |
| Auth | JWT + Google OAuth (Cognito) + Phone OTP (Twilio) |
| Deploy | ECS Fargate (backend), S3 + CloudFront (frontend) |

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.12+
- Node.js 18+
- AWS account with Bedrock, DynamoDB, S3 access

### Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements.txt
playwright install chromium
cp .env.example .env          # fill in your keys
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Settings (.env)
│   │   ├── routes/              # API endpoints + WebSocket
│   │   ├── services/            # Business logic (AI, forms, docs)
│   │   ├── models/              # Pydantic schemas
│   │   └── utils/               # Auth, helpers
│   ├── data/                    # Seed data (schemes JSON)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── screens/             # Page components
│   │   ├── components/          # UI components
│   │   ├── hooks/               # React hooks (voice, automation)
│   │   ├── services/            # API client
│   │   ├── stores/              # Zustand state
│   │   └── types/               # TypeScript types
│   └── package.json
├── docker/                      # Container config (supervisord, start.sh)
├── Dockerfile                   # ECS Fargate deployment
└── template.yaml                # AWS SAM template (alternative)
```

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/send-otp` | Send OTP to phone |
| POST | `/api/v1/auth/verify-otp` | Verify OTP → JWT |
| POST | `/api/v1/auth/google` | Google OAuth login |
| GET | `/api/v1/users/me` | Current user profile |
| PUT | `/api/v1/users/me` | Update profile |
| GET | `/api/v1/schemes/` | Search schemes |
| GET | `/api/v1/schemes/match` | Profile-based matching |
| POST | `/api/v1/documents/upload` | Upload + OCR + classify |
| GET | `/api/v1/documents/` | List documents |
| POST | `/api/v1/applications/start` | Start application |
| WS | `/api/v1/ws/voice` | Real-time voice + AI agent |

---

## Environment Variables

See `backend/.env.example` for the full list. Key variables:

| Variable | Purpose |
|----------|---------|
| `AWS_REGION` | AWS region (ap-south-1) |
| `BEDROCK_MODEL_ID` | LLM model ID |
| `SARVAM_API_KEY` | Sarvam AI for Indian language STT/TTS |
| `JWT_SECRET` | JWT signing secret |
| `TWILIO_*` | Phone OTP via Twilio |
| `GOOGLE_CLIENT_ID` | Google OAuth |

---

## Deployment

The project deploys to AWS using ECS Fargate (backend) and S3 + CloudFront (frontend).

```bash
# Build & push backend Docker image
docker build -t civicbridge .
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker tag civicbridge:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/civicbridge:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/civicbridge:latest

# Deploy frontend
cd frontend && npm run build
aws s3 sync dist/ s3://civicbridge-frontend --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

---

## License

MIT
