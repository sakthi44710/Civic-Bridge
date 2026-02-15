# CivicBridge 🌉

> Transforming government welfare scheme applications from a 5-hour manual process into a 5-minute voice conversation

[![AWS Free Tier](https://img.shields.io/badge/AWS-Free%20Tier-orange)](https://aws.amazon.com/free/)
[![AI for Bharat](https://img.shields.io/badge/Hackathon-AI%20for%20Bharat-blue)](https://aiforBharat.org)
[![Languages](https://img.shields.io/badge/Languages-22%20Indian%20Languages-green)](https://github.com/sakthi44710/Civic-Bridge)

## 🎯 Problem Statement

**400 million eligible Indian citizens struggle with welfare scheme applications:**
- 65% are non-English speakers facing language barriers
- Only 60% successfully apply due to complex processes
- 40% rejection rate due to incomplete or incorrect applications
- Average 5 hours spent per application with multiple government office visits

## 💡 Solution

CivicBridge is an AI-powered platform that helps Indian citizens discover, apply for, and track government welfare schemes through voice-first, multilingual interactions. Built entirely on AWS Free Tier for the AI for Bharat Hackathon.

### Key Features

🗣️ **Voice-First Interaction**
- Natural language conversation in 22 Indian languages
- Code-mixing support (Hinglish, Tanglish, etc.)
- Regional accents and dialects

📱 **Multi-Channel Access**
- Mobile App (<10MB, offline mode)
- Web App (cyber cafe friendly)
- IVR System (feature phones)

🤖 **Digital Clerk - Intelligent Automation**
- Background form filling with screenshot verification
- Pause/resume for OTP and CAPTCHA
- No security bypass - fully compliant

📄 **Document Intelligence**
- Auto-processing: Upload → OCR → Entity Extraction → Classification
- Smart renaming and duplicate detection
- DigiLocker integration

📊 **Application Tracking**
- Visual timeline dashboard
- Smart notifications (WhatsApp, SMS, Push)
- Real-time status updates

## 🏗️ Architecture

### AWS Services Stack (100% Free Tier)

**AI/ML Services:**
- Amazon Bedrock (Llama 3) - Intent understanding & LLM
- AWS Transcribe - Speech-to-text (22 languages)
- AWS Polly - Text-to-speech (regional accents)
- AWS Textract - Document OCR
- AWS Comprehend - Entity extraction
- AWS Translate - Language translation

**Infrastructure (Always Free):**
- AWS Lambda - Serverless compute
- Amazon DynamoDB - NoSQL database
- Amazon S3 - Document storage
- Amazon SNS - Notifications
- AWS Amplify - Web hosting
- Amazon API Gateway - REST/WebSocket APIs
- Amazon EventBridge - Scheduled tasks
- Amazon Location - Geo-matching
- Amazon Connect - IVR system

**Deployment Region:** Mumbai (ap-south-1)

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Android App  │  │   Web App    │  │  IVR System  │      │
│  │ (<10MB)      │  │  (Amplify)   │  │  (Connect)   │      │
│  │ Offline Mode │  │  No Install  │  │ Voice Only   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  API Gateway Layer                           │
│         Amazon API Gateway (REST + WebSocket)                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  Lambda Functions Layer                      │
│  Intent Handler | Document Processor | Form Automation      │
│  Notification Service | Tracking Service | Geo-Matching     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  AI/ML Services Layer                        │
│  Bedrock | Transcribe | Polly | Textract | Comprehend      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                               │
│         DynamoDB | S3 | ElastiCache (Optional)              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                External Integrations                         │
│  MyScheme API | DigiLocker | UMANG | Twilio | EventBridge  │
└─────────────────────────────────────────────────────────────┘
```

## 📖 User Journey

### 5-Minute Application Process

**Step 1: Discovery (1 min)**
```
User: "मुझे scholarship चाहिए" (I need scholarship)
CivicBridge: Shows 3 eligible schemes with benefits
```

**Step 2: Document Check (30 sec)**
```
CivicBridge: Checks Document Vault
- ✅ Aadhaar Card (available)
- ✅ Marksheet (available)
- ❌ Income Certificate (missing - guides user)
```

**Step 3: Form Automation (2 min)**
```
Digital Clerk fills form in background
Shows screenshot after each page
User verifies and approves
Handles OTP/CAPTCHA with user input
```

**Step 4: Submission (30 sec)**
```
Final review → User consent → Submit
Acknowledgment saved to vault
WhatsApp confirmation sent
```

**Step 5: Tracking (Ongoing)**
```
EventBridge checks status every 15 minutes
WhatsApp notification on status change
Visual timeline in dashboard
```

## 🎨 Supported Schemes (MVP)

### Education & Scholarships
- PM Scholarship Scheme
- State Merit Scholarships
- Minority Scholarships

### Healthcare & Medical
- Ayushman Bharat
- State Health Insurance

### Social Welfare & Pensions
- Widow Pension
- Old Age Pension
- Disability Pension

### Agriculture & Farmer Welfare
- PM-KISAN
- Crop Insurance

## 🌍 Supported Languages

**MVP (2 languages):** Hindi, English

**Full Version (22 languages):**
Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese, Urdu, Maithili, Santali, Kashmiri, Nepali, Konkani, Sindhi, Dogri, Manipuri, Bodo, Sanskrit

**Code-Mixing Support:** Hinglish, Tanglish, Manglish, etc.

## 📊 Impact Metrics

### Target Impact
- **Year 1:** 50,000 successful applications
- **Year 2:** 500,000 applications across 5 states
- **Year 3:** 2 million applications, national coverage
- **Social ROI:** ₹500 crores in benefits unlocked

### Key Metrics
- Application success rate: >90%
- Time saved per application: 4.5 hours
- Cost per application: ₹1.50 (AWS Free Tier)
- User satisfaction: >4.5/5

## 🔒 Security & Privacy

- AES-256 encryption at rest (S3)
- TLS 1.3 for data in transit
- No password/credential storage
- No security mechanism bypass
- IAM role-based access control
- Compliant with India's Digital Personal Data Protection Act

## 🛠️ Core Components

### 1. Bharat Voice AI Engine
- Multilingual voice interaction (22 Indian languages)
- Code-mixing support (Hinglish, Tanglish, etc.)
- AWS Transcribe for speech-to-text
- AWS Bedrock (Llama 3) for intent understanding
- AWS Polly for text-to-speech with regional accents

### 2. Intelligent Document Vault
- Auto-processing pipeline: Upload → OCR → Entity Extraction → Classification
- AWS Textract for OCR
- AWS Comprehend for entity extraction
- Smart document renaming and duplicate detection
- Expiry alerts via EventBridge

### 3. Digital Clerk - Form Automation Agent
- Puppeteer on AWS Lambda for headless browser automation
- Page-by-page form filling with screenshot verification
- Pause/resume for OTP and CAPTCHA handling
- Browser state management in DynamoDB
- No security bypass - fully compliant

### 4. Scheme Discovery Engine
- MyScheme API integration for real-time scheme discovery
- AWS Location for geo-matching (state/district schemes)
- Eligibility checking against user profile
- Semantic ranking using AWS Bedrock

### 5. Application Tracking Dashboard
- Visual timeline for each application
- EventBridge scheduled status checks
- Multi-channel notifications (WhatsApp, SMS, Push)
- Real-time status updates via WebSocket

### 6. Notification Service
- AWS SNS for push notifications
- Twilio WhatsApp Business API
- SMS fallback support
- AWS Translate for localization

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React Native + React.js | Mobile & Web Apps |
| Backend | Python + FastAPI | REST API Server |
| LLM | AWS Bedrock (Llama 3) | Intent understanding |
| Voice | AWS Transcribe + Polly | Speech processing |
| OCR | AWS Textract | Document extraction |
| Automation | Puppeteer on Lambda | Form filling |
| Database | DynamoDB | NoSQL storage |
| Storage | S3 | Documents & media |
| Notifications | Twilio + SNS | WhatsApp, SMS, Push |
| Scheduling | EventBridge | Status checks |

## 📁 Project Structure

```
Civic-Bridge/
├── requirements.md      # Detailed requirements document
├── design.md           # System design and architecture
├── workflow-diagrams.md # Visual workflow diagrams
└── README.md           # Project overview (this file)
```

## 🎯 Key Workflows

### Document Processing Pipeline
```
Upload → File Validation → S3 Storage → OCR (Textract) 
→ Entity Extraction (Comprehend) → Classification (Bedrock)
→ Smart Renaming → Duplicate Detection → Vault Storage
```

### Application Workflow
```
User Intent → Scheme Discovery → Document Check 
→ Form Automation (with screenshots) → OTP/CAPTCHA Handling
→ Final Submission → Acknowledgment → Status Tracking
```

### Notification Flow
```
Status Change Detection → EventBridge Trigger 
→ Language Translation → Multi-Channel Delivery 
→ WhatsApp/SMS/Push → User Notification
```

## 📈 Roadmap

### Phase 1: MVP (Current)
- ✅ 2 languages (Hindi, English)
- ✅ 3 schemes (1 per sector)
- ✅ Mobile/Web app
- ✅ Document Vault with OCR
- ✅ Form automation with screenshots
- ✅ WhatsApp notifications

### Phase 2: Pilot (3-6 months)
- 🔄 4 languages (add Tamil, Telugu)
- 🔄 20 schemes (5 per sector)
- 🔄 IVR system
- 🔄 DigiLocker integration
- 🔄 Enhanced tracking

### Phase 3: Scale (6-12 months)
- 📅 10+ languages
- 📅 100+ schemes
- 📅 NGO partnership mode
- 📅 State-level partnerships
- 📅 Advanced analytics

### Phase 4: National (12+ months)
- 📅 All 22 languages
- 📅 500+ schemes
- 📅 Government integration
- 📅 API platform
- 📅 White-label deployment

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team Mindplex

- **Project Lead:** [Your Name]
- **AI/ML Engineer:** [Name]
- **Backend Developer:** [Name]
- **Frontend Developer:** [Name]
- **DevOps Engineer:** [Name]

## 🏆 Hackathon

Built for **AI for Bharat Hackathon 2024**

**Theme:** Leveraging AI to solve India's most pressing challenges

## 📞 Contact

- **Email:** team@civicbridge.in
- **Website:** https://civicbridge.in
- **Twitter:** [@CivicBridge](https://twitter.com/CivicBridge)
- **LinkedIn:** [CivicBridge](https://linkedin.com/company/civicbridge)

## 🙏 Acknowledgments

- Government of India for MyScheme API
- AWS for Free Tier services
- Twilio for WhatsApp Business API
- AI for Bharat Hackathon organizers
- Open source community

## 📚 Documentation

- [Requirements Document](requirements.md) - Detailed functional and non-functional requirements
- [Design Document](design.md) - System architecture, components, and data models
- [Workflow Diagrams](workflow-diagrams.md) - Visual representation of key workflows

## 🎥 Demo

Watch our demo video: [CivicBridge Demo](https://youtube.com/watch?v=demo)

---

**Made with ❤️ for India by Team Mindplex**

*Empowering 400 million citizens to access their rightful benefits*
