# CivicBridge

## AI-Powered Government Scheme Discovery Platform

> **Team Mindplex** | AI for Bharat Hackathon

CivicBridge helps Indian citizens discover, apply for, and track government welfare schemes through voice-first, multilingual interactions.

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- AWS Account with configured credentials

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Edit with your settings
python -m uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### API Docs

Visit http://localhost:8000/docs for interactive Swagger documentation.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  React Web  │────▸│  FastAPI      │────▸│  AWS Services   │
│  (Vite +    │     │  (Lambda via  │     │                 │
│  Tailwind)  │     │   Mangum)     │     │  • Bedrock (AI) │
└─────────────┘     │              │     │  • Textract     │
                    │  41 REST     │     │  • Comprehend   │
                    │  Endpoints   │     │  • Transcribe   │
                    └──────────────┘     │  • Polly        │
                                        │  • Translate    │
                                        │  • DynamoDB     │
                                        │  • S3           │
                                        │  • SNS          │
                                        └─────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Smart Discovery** | AI matches citizens with eligible schemes based on profile |
| **Voice-First** | Talk in any of 22 Indian languages |
| **Auto-Fill Forms** | Browser automation fills government portal forms |
| **Document OCR** | Upload documents → auto-extract data via Textract |
| **Real-Time Tracking** | Track application status with SMS notifications |
| **22 Languages** | Full support for all scheduled Indian languages |

## Scheme Categories

| Category | Count | Examples |
|----------|-------|---------|
| Education | 6 | PM Vidyalaxmi, Post Matric Scholarship, NMMSS, PMSSS, Pragati |
| Healthcare | 6 | Ayushman Bharat PM-JAY, PMSMA, JSY, RSBY |
| Agriculture | 6 | PM-KISAN, PMFBY, KCC, Soil Health Card |
| Welfare | 8 | MGNREGA, PMAY, NSAP Pension, Ujjwala, MUDRA, PM Vishwakarma |

## API Endpoints (41 total)

- **Auth**: send-otp, verify-otp, register
- **Users**: profile CRUD, dashboard
- **Chat**: AI conversation with history
- **Voice**: Speech-to-Text → AI → Text-to-Speech
- **Documents**: Upload, OCR, classify, manage
- **Schemes**: Search, filter, match, eligibility check
- **Applications**: Start, automate, verify, submit, track
- **Translation**: Text translation, language detection

## AWS Deployment

```bash
sam build
sam deploy --guided
```

## Tech Stack

- **Backend**: Python, FastAPI, Mangum (Lambda adapter)
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion
- **AI**: AWS Bedrock (Claude 3 Haiku)
- **Voice**: AWS Transcribe + Polly
- **OCR**: AWS Textract + Comprehend
- **Database**: DynamoDB (5 tables)
- **Storage**: S3 (AES-256 encrypted)
- **Auth**: Phone OTP via SNS + JWT
- **Translation**: AWS Translate (22 languages)

## License

MIT
