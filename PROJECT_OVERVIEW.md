# CivicBridge — Complete Project Overview

> **Voice-first AI platform that transforms government welfare scheme applications from a 5-hour manual ordeal into a 5-minute voice conversation — built for the 400 million Indians who need it most.**

---

## 1. The Problem We Solve

India runs the world's largest welfare system — thousands of government schemes across education, healthcare, pensions, agriculture, and more. Yet **400 million eligible citizens fail to access their rightful benefits** every year.

| Barrier | Impact |
|---|---|
| **Language** | 65% are non-English speakers; most portals are English-only |
| **Literacy** | Millions cannot read or fill complex multi-page forms |
| **Complexity** | Average 5 hours and multiple office visits per application |
| **Rejection** | 40% rejection rate due to incomplete or incorrect submissions |
| **Awareness** | Citizens don't know which schemes they qualify for |
| **Documents** | Gathering, organizing, and uploading documents is overwhelming |
| **Tracking** | "Submit and pray" — no visibility into application status |

**The result:** ₹2,00,000+ crores in welfare benefits go unclaimed annually. The people who need help the most are locked out by the systems designed to help them.

---

## 2. Our Solution: CivicBridge

CivicBridge is an **AI-powered, voice-first platform** where citizens simply *talk* — in their own language, in their own words — and the system handles everything: scheme discovery, document processing, form filling, submission, and tracking.

### The 5-Minute Application Flow

```
Step 1 → User speaks: "मुझे scholarship चाहिए" (I need a scholarship)
Step 2 → AI identifies 3 matching schemes and explains benefits in Hindi
Step 3 → Document Vault checks: ✅ Aadhaar, ✅ Marksheet, ❌ Income Certificate
Step 4 → Digital Clerk fills government forms in background with screenshot verification
Step 5 → User approves, application submitted, WhatsApp confirmation sent
Step 6 → Continuous tracking with real-time status notifications
```

### What Makes This Different

| Traditional Approach | CivicBridge |
|---|---|
| English-first text forms | Voice-first in 16+ Indian languages |
| Requires digital literacy | Works for illiterate users |
| Desktop browsers | Mobile-optimized, works on ₹5,000 phones |
| Manual form filling | AI fills forms automatically |
| User must know schemes | AI finds matching schemes for you |
| Submit and forget | Real-time tracking with WhatsApp alerts |
| No document help | Auto OCR + classification + DigiLocker |

---

## 3. Core Platform Features

### 3.1 Voice-First Interaction Engine

The heart of CivicBridge. Users interact through natural voice conversation — not text, not forms.

- **16 Indian languages** supported: Hindi, English, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Sanskrit, Nepali, Sindhi
- **Code-mixing support**: Hinglish ("mujhe scholarship ke liye apply karna hai"), Tanglish, and other natural mixes
- **Regional accents and dialects** handled natively
- **Live voice chat**: Phone-call style interaction with an animated AI globe
- **Real-time captions**: Voice transcription displayed below the globe for verification
- **Audio responses**: AI speaks back in the user's chosen language

**Tech Pipeline:**
```
User Speech → AWS Transcribe (STT) → DeepSeek V3 (Intent + Response) 
→ AWS Polly (TTS) → Audio Response to User
```

### 3.2 Intelligent Scheme Discovery

Citizens describe their needs in plain language. CivicBridge identifies every scheme they qualify for.

- **26 government schemes** seeded across 6 categories:
  - Education & Scholarships (AICTE, UGC, state merit schemes)
  - Healthcare & Medical (Ayushman Bharat, state health insurance)
  - Social Welfare & Pensions (widow, old age, disability pensions)
  - Agriculture & Farmer Welfare (PM-KISAN, crop insurance)
  - Women & Child Development
  - Employment & Skill Development
- **Eligibility matching** against user profile (age, income, category, state, education)
- **Geo-matching** for state and district-specific schemes
- **Ranked results** by relevance, benefit amount, and success probability

### 3.3 Document Intelligence Vault

A smart document management system that eliminates the document headache.

- **Auto-processing pipeline**: Upload → OCR (Textract) → Entity Extraction (Comprehend) → Classification → Smart Rename
- **AI-generated file names**: `Aadhaar_Card_Rahul_Kumar.pdf` instead of `IMG_20240315.jpg`
- **DigiLocker integration**: One-click import of government-issued documents
- **Encrypted storage**: All documents stored in S3 with AES-256 encryption
- **Document types supported**: Aadhaar, PAN, Income Certificate, Caste Certificate, Bank Passbook, Marksheets, Land Records, and more
- **Expiry tracking**: Alerts before document expiration
- **Duplicate detection**: Prevents redundant uploads

### 3.4 Digital Clerk — Automated Form Filling

An AI agent that fills complex government forms in the background while showing users exactly what it's doing.

- **Background automation**: Fills multi-page government forms using extracted document data
- **Screenshot verification**: Shows the user each completed page for approval before proceeding
- **Pause/resume capability**: Stops for OTP and CAPTCHA — never bypasses security
- **Data mapping**: Intelligently maps extracted entities to form fields
- **100% compliant**: No security bypass — fully respects OTP, CAPTCHA, and authentication

### 3.5 Application Tracking Dashboard

Real-time visibility into every application's status.

- **Visual timeline** for each submitted application
- **Status tracking**: Approved, Rejected, Pending, Action Required
- **Multi-channel notifications**: WhatsApp, SMS, Push notifications
- **Smart alerts**: Reminds users of deadlines and required actions
- **Status types with color coding**: Green (approved), Yellow (pending), Red (rejected), Blue (action required)

### 3.6 Multi-Channel Access

Three ways to reach CivicBridge — ensuring no citizen is left behind.

| Channel | Target Users | Key Feature |
|---|---|---|
| **Web App** | Smartphone & computer users | Full voice-first experience with animated globe |
| **Mobile App (APK)** | Android users (₹5,000 phones) | Offline mode, <10MB size, battery efficient |
| **IVR System** | Feature phone users | Voice-only, no internet required |

---

## 4. User Interface — Voice-First Design

### 4.1 Design Philosophy

> "If they can make a phone call, they can use CivicBridge."

The UI is designed for non-literate users. There are **no complex forms, no tiny text, no confusing navigation**. The primary interaction is voice — everything else supports it.

### 4.2 Flow Architecture

```
Splash Screen (3s) → Language Selection → Authentication → Voice Chat (Main Hub)
                                                              ├── Left Panel  → Profile, Schemes, Applications, Settings
                                                              └── Right Panel → Known Details, Document Vault
```

### 4.3 Screen-by-Screen Breakdown

#### Splash Screen
- Full-screen dark branding: **"AWS AI for Bharat"** + **CivicBridge**
- Animated gradient orb and floating particles
- Auto-redirects after 3 seconds (smart routing based on auth state)
- "Download Mobile App" button at bottom

#### Language Selection
- 16 Indian languages displayed in a grid with native script names
- Each language shows both native (हिन्दी) and English (Hindi) text
- Header text dynamically changes based on hovered/selected language
- Single tap to select and proceed

#### Authentication
- **Three-step flow**: Contact Info → OTP Verification → Registration
- Phone number with +91 prefix (primary)
- Optional email for additional OTP delivery
- 6-digit OTP with tracking input
- Google Sign-in integration (OAuth via AWS)
- 30-second resend timer
- Dark glass-morphism aesthetic

#### Voice Chat (Main Screen)
- **Animated AI Globe** at center — the primary interaction point
  - **Idle**: Gentle orbiting particles, mic icon, "Tap to speak" text
  - **Listening**: Fast particles, pulse rings, sound bars — recording user voice
  - **Processing**: Spinner animation while AI processes
  - **Speaking**: Green wave bars, AI voice playing back
  - **Paused**: Dimmed state with play icon
- **Caption bar** below globe — shows real-time transcription
- **Screenshot popup** above globe — shows form-filling progress
- **Left Panel** (slide from left): Profile, Browse Schemes, My Applications, Change Language, Download App, Sign Out
- **Right Panel** (slide from right): 
  - Top half: Known Details (user profile + AI-collected info from conversation)
  - Bottom half: Document Vault with upload, download, DigiLocker fetch

#### Supporting Pages
- **Schemes Browser**: Searchable list of all 26 schemes with category tags
- **Scheme Detail**: Full breakdown with benefits, eligibility, required documents, "Ask AI to Apply" button
- **Applications**: Status-colored cards for each submitted application
- **Profile**: Editable form (name, email, DOB, gender, category, state, district, pincode, income, occupation, education)

### 4.4 Visual Design System

- **Theme**: Dark-first (#0a0a0f base)
- **Accent Colors**: Cyan (#00d4ff), Saffron (#ff9933), Green (#00cc88)
- **Glass Morphism**: Semi-transparent panels with backdrop blur
- **Animations**: Framer Motion transitions, CSS keyframe animations
- **Typography**: System fonts, large text, high contrast
- **Background**: Canvas-animated particles with gradient mesh blobs

---

## 5. Technical Architecture

### 5.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │  React SPA  │  │ Android APK │  │  IVR System  │        │
│  │  (Vite)     │  │ (Capacitor) │  │  (Connect)   │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼────────────────────────────────┐
│                    BACKEND API (FastAPI)                      │
│  Port 8000 • Python 3.14 • Uvicorn • JWT Auth                │
│  ┌──────────────────────────────────────────────────┐        │
│  │  Routes                                          │        │
│  │  /auth   /voice   /chat   /schemes               │        │
│  │  /documents   /applications   /digilocker         │        │
│  │  /users   /translate                              │        │
│  └──────────────────────────────────────────────────┘        │
│  ┌──────────────────────────────────────────────────┐        │
│  │  Services                                         │        │
│  │  auth_service      bedrock_service (DeepSeek V3)  │        │
│  │  dynamodb_service   s3_service                    │        │
│  │  transcribe_service polly_service                 │        │
│  │  textract_service   comprehend_service            │        │
│  │  translate_service  document_service              │        │
│  │  scheme_service     notification_service          │        │
│  │  tracking_service   automation_service            │        │
│  └──────────────────────────────────────────────────┘        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                     AWS SERVICES                             │
│  ┌─────────┐ ┌───────────┐ ┌───────┐ ┌──────────┐          │
│  │Bedrock  │ │Transcribe │ │Polly  │ │Textract  │          │
│  │DeepSeek │ │(STT)      │ │(TTS)  │ │(OCR)     │          │
│  │V3/V3.2  │ │           │ │       │ │          │          │
│  └─────────┘ └───────────┘ └───────┘ └──────────┘          │
│  ┌──────────┐ ┌───────────┐ ┌───────┐ ┌──────────┐         │
│  │Comprehend│ │Translate  │ │SNS    │ │SES       │         │
│  │(NER)     │ │(i18n)     │ │(Push) │ │(Email)   │         │
│  └──────────┘ └───────────┘ └───────┘ └──────────┘         │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                      DATA LAYER                              │
│  ┌────────────────────────┐  ┌────────────────────────┐     │
│  │  Amazon DynamoDB       │  │  Amazon S3             │     │
│  │  • civicbridge-users   │  │  • civicbridge-docs    │     │
│  │  • civicbridge-docs    │  │  • civicbridge-screens │     │
│  │  • civicbridge-apps    │  │  • AES-256 encrypted   │     │
│  │  • civicbridge-schemes │  │                        │     │
│  │  • civicbridge-convos  │  │                        │     │
│  └────────────────────────┘  └────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                  EXTERNAL INTEGRATIONS                       │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐   │
│  │Twilio    │ │DigiLocker │ │Google     │ │Government  │   │
│  │(SMS/OTP) │ │(Docs)     │ │(OAuth)    │ │Portals     │   │
│  └──────────┘ └───────────┘ └───────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React | 18.2.0 | Single-page application |
| **Build Tool** | Vite | 5.4.21 | Fast HMR, optimized builds |
| **State Management** | Zustand | 4.4.0 | Lightweight stores (auth, language, voice, scheme) |
| **Routing** | React Router DOM | 6.x | Client-side routing |
| **Animation** | Framer Motion | 10.16.0 | Page transitions, panel slides |
| **3D/Visual** | Spline React | Latest | Potential 3D globe integration |
| **Icons** | Lucide React | Latest | Consistent iconography |
| **Styling** | Tailwind CSS | 3.x | Utility-first, custom dark theme |
| **Backend Framework** | FastAPI | Latest | Async Python REST API |
| **Runtime** | Python | 3.14.3 | Backend language |
| **Server** | Uvicorn | Latest | ASGI server |
| **Auth** | JWT + Twilio OTP | — | Phone-based + email-based authentication |
| **AI Model** | DeepSeek V3 / V3.2 | — | Via Amazon Bedrock Converse API |
| **Cloud** | AWS | ap-south-1 | Mumbai region for Indian latency |
| **IaC** | SAM (template.yaml) | — | CloudFormation-based deployment |

### 5.3 Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/send-otp` | Send OTP to phone (Twilio) and email (SES) |
| `POST` | `/api/v1/auth/verify-otp` | Verify 6-digit OTP |
| `POST` | `/api/v1/auth/register` | Register new user with profile data |
| `POST` | `/api/v1/auth/google` | Google OAuth login (ID token verification) |
| `POST` | `/api/v1/voice/process` | Process voice audio → AI response + audio |
| `POST` | `/api/v1/chat/message` | Text-based chat with AI |
| `GET` | `/api/v1/schemes` | List all schemes (with search/filter) |
| `GET` | `/api/v1/schemes/{id}` | Get scheme details |
| `POST` | `/api/v1/documents/upload` | Upload document → OCR pipeline |
| `GET` | `/api/v1/documents` | List user's documents |
| `GET` | `/api/v1/documents/{id}/download` | Get presigned download URL |
| `GET` | `/api/v1/applications` | List user's applications |
| `POST` | `/api/v1/applications` | Submit new application |
| `POST` | `/api/v1/digilocker/initiate` | Start DigiLocker OAuth flow |
| `GET` | `/api/v1/digilocker/callback` | DigiLocker OAuth callback |
| `GET` | `/api/v1/digilocker/documents` | List DigiLocker document types |
| `POST` | `/api/v1/translate` | Translate text between languages |
| `GET` | `/api/v1/users/profile` | Get user profile |
| `PUT` | `/api/v1/users/profile` | Update user profile |
| `GET` | `/health` | Health check |

### 5.4 Database Schema (DynamoDB)

**5 Tables — All Pay-Per-Request (serverless billing):**

| Table | Partition Key | Sort Key | GSI | Purpose |
|---|---|---|---|---|
| `civicbridge-users` | `user_id` | — | `phone-index` (phone_number) | User accounts & profiles |
| `civicbridge-documents` | `user_id` | `document_id` | — | Document metadata & OCR results |
| `civicbridge-applications` | `user_id` | `application_id` | — | Submitted applications & status |
| `civicbridge-schemes` | `scheme_id` | — | `category-index` (category) | Government schemes catalog (26 seeded) |
| `civicbridge-conversations` | `user_id` | `conversation_id` | — | Chat/voice conversation history |

### 5.5 S3 Storage

| Bucket | Purpose | Encryption |
|---|---|---|
| `civicbridge-documents-*` | User-uploaded documents (Aadhaar, PAN, certificates) | AES-256 |
| `civicbridge-screenshots-*` | Form-filling screenshots for verification | AES-256 |

### 5.6 AWS SAM Deployment (template.yaml)

The project includes a production-grade SAM template for one-command AWS deployment:
- Lambda function with all permissions (DynamoDB CRUD, S3 CRUD, Bedrock, Transcribe, Polly, Textract, Comprehend, Translate, SNS)
- API Gateway (REST) with CORS
- All 5 DynamoDB tables with GSIs
- Both S3 buckets with encryption and public access block
- Parameterized stages (dev, staging, prod)

---

## 6. AI & Machine Learning Pipeline

### 6.1 Voice Processing Pipeline

```
┌──────────┐     ┌─────────────┐     ┌────────────┐     ┌──────────┐
│ User     │────▶│ AWS         │────▶│ DeepSeek   │────▶│ AWS      │
│ Speech   │     │ Transcribe  │     │ V3 (Bedrock│     │ Polly    │
│ (Audio)  │     │ (STT)       │     │ Converse)  │     │ (TTS)    │
└──────────┘     └─────────────┘     └────────────┘     └──────────┘
   Mic input      Hindi/English       Intent parsing      Audio
   MediaRecorder  → Text             Response gen         response
                                     Context-aware        in user's
                                     Multilingual         language
```

### 6.2 Document Processing Pipeline

```
Upload → File Validation → S3 Storage 
  → AWS Textract (OCR — extract all text)
  → AWS Comprehend (NER — name, DOB, ID numbers, addresses)
  → DeepSeek V3 (Classification — Aadhaar? PAN? Marksheet?)
  → Smart Rename (Aadhaar_Card_Rahul_Kumar.pdf)
  → Duplicate Detection
  → Document Vault (DynamoDB metadata + S3 file)
```

### 6.3 AI Models Used

| Model | Service | Purpose |
|---|---|---|
| **DeepSeek V3** | Amazon Bedrock | Primary chat/voice intent understanding |
| **DeepSeek V3.2** | Amazon Bedrock | Complex reasoning and scheme matching |
| **AWS Transcribe** | Managed | Speech-to-text (Indian languages) |
| **AWS Polly** | Managed | Text-to-speech (regional accents) |
| **AWS Textract** | Managed | Document OCR |
| **AWS Comprehend** | Managed | Named Entity Recognition |
| **AWS Translate** | Managed | Cross-language translation |

---

## 7. Security & Privacy

### 7.1 Authentication Flow

```
Phone + Email → OTP (Twilio SMS + AWS SES Email) → JWT Token
Google OAuth → ID Token Verification → JWT Token
```

- **JWT-based session management** with token refresh
- **Phone as primary identity** (India's most universal identifier)
- **Email as secondary** (optional, for additional verification)
- **Google Sign-in** for users with Google accounts
- **No password storage** — purely OTP-based

### 7.2 Data Protection

| Layer | Protection |
|---|---|
| **Documents at rest** | AES-256 encryption (S3 SSE) |
| **Data in transit** | TLS 1.3 (HTTPS) |
| **OTP tokens** | TTL-based expiration in DynamoDB |
| **API access** | JWT Bearer token authentication |
| **S3 buckets** | Public access fully blocked |
| **Form automation** | Never bypasses OTP or CAPTCHA |
| **Compliance** | India's Digital Personal Data Protection Act |

### 7.3 DigiLocker Integration

- OAuth 2.0 flow for user consent
- Documents fetched directly from government-issued DigiLocker
- Tamper-proof government-verified documents
- Demo mode available when credentials not configured

---

## 8. Project Structure

```
Civic-Bridge/
├── template.yaml                    # AWS SAM deployment template
├── PROJECT_OVERVIEW.md              # This document
├── README.md                        # Quick project overview
├── requirements.md                  # Detailed requirements (20 items)
├── design.md                        # System design document
├── workflow-diagrams.md             # Visual workflow diagrams
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app initialization, CORS, routers
│   │   ├── config.py                # Settings (env vars, AWS config, Twilio)
│   │   ├── models/
│   │   │   └── user.py              # Pydantic models (UserCreate, OTPRequest, etc.)
│   │   ├── routes/
│   │   │   ├── auth.py              # OTP send/verify, register, Google OAuth
│   │   │   ├── voice.py             # Voice audio processing endpoint
│   │   │   ├── chat.py              # Text chat with AI
│   │   │   ├── schemes.py           # Scheme listing and details
│   │   │   ├── documents.py         # Document CRUD + download
│   │   │   ├── applications.py      # Application submission + tracking
│   │   │   ├── digilocker.py        # DigiLocker OAuth integration
│   │   │   ├── users.py             # User profile management
│   │   │   └── translate.py         # Language translation
│   │   ├── services/
│   │   │   ├── auth_service.py      # OTP gen, Twilio SMS, SES email, JWT, Google OAuth
│   │   │   ├── bedrock_service.py   # DeepSeek V3/V3.2 via Bedrock Converse API
│   │   │   ├── dynamodb_service.py  # All DynamoDB CRUD operations
│   │   │   ├── s3_service.py        # S3 upload/download/presigned URLs
│   │   │   ├── transcribe_service.py # Speech-to-text
│   │   │   ├── polly_service.py     # Text-to-speech
│   │   │   ├── textract_service.py  # Document OCR
│   │   │   ├── comprehend_service.py # Entity extraction (NER)
│   │   │   ├── translate_service.py # AWS Translate wrapper
│   │   │   ├── document_service.py  # Document processing pipeline
│   │   │   ├── scheme_service.py    # Scheme matching engine
│   │   │   ├── notification_service.py # SNS/Twilio notifications
│   │   │   ├── tracking_service.py  # Application status tracking
│   │   │   ├── automation_service.py # Form automation agent
│   │   │   └── aws_clients.py       # Centralized AWS client factory
│   │   ├── automation/              # Headless browser automation
│   │   └── utils/                   # Shared utilities
│   ├── test_api.py                  # Full API test suite
│   └── test_api_quick.py            # Quick smoke tests (4 endpoints)
│
├── frontend/
│   ├── index.html                   # Entry point (dark theme)
│   ├── vite.config.js               # Vite configuration
│   ├── tailwind.config.js           # Custom dark theme palette
│   ├── package.json                 # Dependencies
│   ├── src/
│   │   ├── main.jsx                 # React entry point
│   │   ├── App.jsx                  # Routes: Splash → Language → Auth → Chat
│   │   ├── index.css                # Global styles, animations, glass effects
│   │   ├── i18n.js                  # Internationalization config
│   │   ├── store/
│   │   │   └── index.js             # Zustand stores (auth, language, scheme, voice)
│   │   ├── services/
│   │   │   └── api.js               # Axios API client (auth, voice, docs, schemes, digilocker)
│   │   ├── pages/
│   │   │   ├── Splash.jsx           # Branded splash with auto-redirect
│   │   │   ├── LanguageSelect.jsx   # 16-language grid selection
│   │   │   ├── Auth.jsx             # Phone/Email OTP + Google OAuth
│   │   │   ├── VoiceChat.jsx        # Main voice interaction with globe
│   │   │   ├── SchemesPage.jsx      # Schemes browser with search
│   │   │   ├── SchemeDetailPage.jsx  # Scheme details + "Ask AI to Apply"
│   │   │   ├── ApplicationsPage.jsx # Applications list with status
│   │   │   └── ProfilePage.jsx      # User profile editor
│   │   └── components/
│   │       ├── Globe.jsx            # Animated AI orb (idle/listening/speaking/processing)
│   │       ├── LeftPanel.jsx        # Navigation panel (profile, schemes, apps, settings)
│   │       ├── RightPanel.jsx       # Details + Document Vault panel
│   │       └── Background.jsx       # Canvas particle animation with gradient blobs
│   └── dist/                        # Production build output
```

---

## 9. Development & Deployment

### 9.1 Local Development

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev          # → http://localhost:5173
npm run build        # → dist/ (production)
```

### 9.2 AWS Deployment (SAM)

```bash
sam build
sam deploy --guided     # First time (creates stack)
sam deploy              # Subsequent deployments
```

Deploys: Lambda + API Gateway + 5 DynamoDB tables + 2 S3 buckets

### 9.3 Environment Configuration

| Variable | Description |
|---|---|
| `AWS_REGION` | `ap-south-1` (Mumbai) |
| `BEDROCK_MODEL_ID` | `deepseek.v3-v1:0` |
| `BEDROCK_SMART_MODEL_ID` | `deepseek.v3.2` |
| `TWILIO_ACCOUNT_SID` | Twilio account for SMS OTP |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone |
| `JWT_SECRET` | JWT signing secret |
| `DIGILOCKER_CLIENT_ID` | DigiLocker OAuth client (optional) |
| `DIGILOCKER_CLIENT_SECRET` | DigiLocker OAuth secret (optional) |

---

## 10. Current Status & Build Metrics

### What's Built & Working

| Component | Status | Details |
|---|---|---|
| Backend API | ✅ Running | 9 route modules, 15 service modules, port 8000 |
| Frontend App | ✅ Building | 139 modules, 0 errors, 2.75s build time |
| Authentication | ✅ Working | Phone OTP (Twilio) + Email OTP (SES) + Google OAuth |
| Scheme Database | ✅ Seeded | 26 government schemes across 6 categories |
| Voice Processing | ✅ Implemented | MediaRecorder → API → Transcribe → DeepSeek → Polly |
| Document Upload | ✅ Working | Upload → S3 → OCR → Entity Extraction → Classification |
| DigiLocker | ✅ Integrated | OAuth flow + document fetch (demo mode available) |
| All API Tests | ✅ Passing | 4/4 smoke tests (OTP, auth, schemes, health) |

### Build Output

```
Frontend: 139 modules → 330.50 KB JS (108.30 KB gzip) + 23.00 KB CSS (5.14 KB gzip)
Backend: 0 lint errors, all endpoints responding
```

---

## 11. Impact & Vision

### Target Impact

| Timeline | Applications | Coverage | Benefit Unlocked |
|---|---|---|---|
| Year 1 | 50,000 | 1 state pilot | ₹50 crores |
| Year 2 | 500,000 | 5 states | ₹150 crores |
| Year 3 | 2,000,000 | National | ₹500 crores |

### Key Performance Metrics

- **Application completion rate**: >90% (vs 60% manual)
- **Time per application**: 5 minutes (vs 5 hours manual)
- **Rejection rate**: <10% (vs 40% manual)
- **Cost per application**: ₹1.50 (AWS Free Tier)
- **User satisfaction target**: >4.5/5

### Social Impact Goals

- Bridge the digital divide for 400 million underserved citizens
- Enable non-literate users to access welfare schemes independently
- Reduce corruption by automating the intermediary layer
- Unlock billions in unclaimed government benefits
- Set the standard for accessible government technology in India

---

## 12. Team & Hackathon

**Team**: Mindplex  
**Hackathon**: AI for Bharat  
**Theme**: Leveraging AI to solve India's most pressing challenges  
**AWS Region**: Mumbai (ap-south-1)  
**Architecture**: 100% AWS-native, serverless, Free Tier optimized  

---

*CivicBridge — Because every Indian citizen deserves access to their rightful benefits, regardless of language, literacy, or technology.*
