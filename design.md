# CivicBridge - Design Document

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Devices                             │
│  (Mobile Browsers, Desktop Browsers, Progressive Web App)       │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS/WSS
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AWS CloudFront (CDN)                          │
│              (Static Assets + API Gateway)                       │
└────────────┬───────────────────────────────────┬────────────────┘
             │                                   │
             ↓                                   ↓
┌────────────────────────┐         ┌────────────────────────────┐
│   S3 Static Hosting    │         │   ECS Fargate Cluster      │
│   (React Frontend)     │         │   (FastAPI Backend)        │
│                        │         │                            │
│  - React 19 + TS       │         │  - FastAPI + Python 3.12   │
│  - Tailwind CSS 4      │         │  - Playwright Browser      │
│  - Zustand State       │         │  - WebSocket Server        │
│  - Framer Motion       │         │  - Xvfb + noVNC            │
└────────────────────────┘         └────────────┬───────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ↓                            ↓                            ↓
         ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
         │  AWS Bedrock     │        │  Sarvam AI       │        │  AWS Services    │
         │                  │        │                  │        │                  │
         │  - Mistral Large │        │  - STT (Saarika) │        │  - DynamoDB      │
         │  - Tool Calling  │        │  - TTS (Bulbul)  │        │  - S3            │
         │  - Streaming     │        │  - 22 Languages  │        │  - Textract      │
         └──────────────────┘        └──────────────────┘        │  - Comprehend    │
                                                                  │  - Translate     │
                                                                  │  - SES           │
                                                                  │  - Cognito       │
                                                                  └──────────────────┘
```

### Component Architecture

```
Frontend (React + TypeScript)
├── Screens/
│   ├── WelcomeScreen          # Landing page
│   ├── PhoneAuthScreen        # Authentication
│   ├── DashboardScreen        # Main dashboard
│   ├── VoiceScreen            # Voice chat interface
│   ├── SchemeDiscoveryScreen  # Browse schemes
│   ├── SchemeDetailScreen     # Scheme details
│   ├── ApplicationFlowScreen  # Live form filling
│   ├── DocumentVaultScreen    # Document management
│   ├── ProfileScreen          # User profile
│   └── TrackingScreen         # Application tracking
├── Components/
│   ├── VoiceGlobe            # Animated voice indicator
│   ├── ChatMessage           # Message bubble
│   ├── SchemeCard            # Scheme display card
│   ├── DocumentCard          # Document display card
│   ├── FormProgress          # Progress indicator
│   ├── LiveBrowserView       # Browser viewport stream
│   └── MarkdownRenderer      # Rich text rendering
├── Hooks/
│   ├── useVoiceCall          # Voice pipeline management
│   ├── useWebSocket          # WebSocket connection
│   ├── useAuth               # Authentication state
│   └── useFormAutomation     # Form filling state
├── Services/
│   ├── api.ts                # REST API client
│   ├── websocket.ts          # WebSocket client
│   └── storage.ts            # Local storage
└── Stores/
    ├── authStore             # User authentication
    ├── voiceStore            # Voice state
    ├── chatStore             # Chat history
    └── applicationStore      # Application state

Backend (FastAPI + Python)
├── Routes/
│   ├── auth.py               # Authentication endpoints
│   ├── users.py              # User management
│   ├── chat.py               # Text chat
│   ├── documents.py          # Document upload/management
│   ├── schemes.py            # Scheme discovery
│   ├── applications.py       # Application management
│   ├── translate.py          # Translation
│   ├── digilocker.py         # DigiLocker integration
│   └── ws.py                 # WebSocket endpoints
├── Services/
│   ├── agent_orchestrator.py    # Multi-agent coordination
│   ├── auth_service.py           # Authentication logic
│   ├── bedrock_service.py        # LLM integration
│   ├── sarvam_service.py         # STT/TTS integration
│   ├── cognito_service.py        # Google OAuth
│   ├── document_service.py       # Document processing
│   ├── textract_service.py       # OCR
│   ├── comprehend_service.py     # NLP
│   ├── translate_service.py      # Translation
│   ├── form_agent_service.py     # Browser automation
│   ├── page_analyzer.py          # Form analysis
│   ├── scheme_service.py         # Scheme matching
│   ├── dynamodb_service.py       # Database
│   ├── s3_service.py             # Storage
│   ├── notification_service.py   # Notifications
│   ├── tracking_service.py       # Application tracking
│   └── web_search_service.py     # Web search
├── Models/
│   ├── user.py               # User schemas
│   ├── document.py           # Document schemas
│   ├── scheme.py             # Scheme schemas
│   ├── application.py        # Application schemas
│   └── conversation.py       # Conversation schemas
└── Utils/
    ├── auth.py               # JWT utilities
    └── helpers.py            # Common utilities
```

## Data Models

### User Model
```python
class User:
    user_id: str              # UUID
    phone_number: str         # +91XXXXXXXXXX
    email: str                # Optional
    name: str
    dob: str                  # YYYY-MM-DD
    gender: str               # Male/Female/Other
    category: str             # General/SC/ST/OBC
    state: str
    district: str
    pincode: str
    address: str
    preferred_language: str   # Language code
    profile_complete: bool
    auth_provider: str        # phone/google
    created_at: str           # ISO timestamp
    updated_at: str
```

### Document Model
```python
class Document:
    document_id: str          # UUID
    user_id: str
    document_type: str        # aadhaar/pan/income/etc
    file_name: str
    file_size: int            # Bytes
    s3_key: str
    ocr_text: str             # Extracted text
    extracted_data: dict      # Structured data
    confidence: float         # 0.0 to 1.0
    upload_date: str          # ISO timestamp
    status: str               # pending/processed/failed
```

### Scheme Model
```python
class Scheme:
    scheme_id: str            # UUID
    name: str
    name_local: dict          # {lang: name}
    description: str
    description_local: dict
    category: str             # education/health/etc
    state: str                # ALL or specific state
    benefits: list[str]
    eligibility: dict         # Criteria
    documents_required: list[str]
    application_url: str
    official_website: str
    last_updated: str
```

### Application Model
```python
class Application:
    application_id: str       # UUID
    user_id: str
    scheme_id: str
    scheme_name: str
    status: str               # draft/in_progress/submitted/approved/rejected
    conversation_id: str
    form_data: dict           # Filled form fields
    documents_used: list[str] # Document IDs
    screenshot_url: str       # Live form screenshot
    submission_date: str
    tracking_number: str
    created_at: str
    updated_at: str
```

### Conversation Model
```python
class Conversation:
    conversation_id: str      # UUID
    user_id: str
    language: str
    messages: list[Message]
    context: dict             # Conversation state
    agents_used: list[str]    # Agent history
    created_at: str
    updated_at: str

class Message:
    role: str                 # user/assistant/system
    content: str
    timestamp: str
    intent: str               # Optional
    agents: list[str]         # Optional
```

## API Design

### REST API Endpoints

#### Authentication
```
POST   /api/v1/auth/send-otp
POST   /api/v1/auth/verify-otp
POST   /api/v1/auth/register
POST   /api/v1/auth/google
POST   /api/v1/auth/refresh
```

#### Users
```
GET    /api/v1/users/me
PUT    /api/v1/users/me
DELETE /api/v1/users/me
```

#### Schemes
```
GET    /api/v1/schemes/
GET    /api/v1/schemes/:id
GET    /api/v1/schemes/match
GET    /api/v1/schemes/categories
POST   /api/v1/schemes/search
```

#### Documents
```
POST   /api/v1/documents/upload
GET    /api/v1/documents/
GET    /api/v1/documents/:id
DELETE /api/v1/documents/:id
GET    /api/v1/documents/:id/download
```

#### Applications
```
POST   /api/v1/applications/start
GET    /api/v1/applications/
GET    /api/v1/applications/:id
PUT    /api/v1/applications/:id
DELETE /api/v1/applications/:id
GET    /api/v1/applications/:id/status
```

#### Chat
```
POST   /api/v1/chat/message
GET    /api/v1/chat/history/:conversation_id
DELETE /api/v1/chat/history/:conversation_id
```

#### Translation
```
POST   /api/v1/translate
GET    /api/v1/languages
```

#### Utility
```
GET    /health
GET    /
```

### WebSocket API

#### Voice Chat WebSocket
```
WS /api/v1/ws/voice?token=<jwt>&language=<lang>

Client → Server Messages:
{
  "type": "audio_chunk",
  "data": "<base64_audio>",
  "sequence": 1
}
{
  "type": "text_message",
  "text": "Hello",
  "language": "hi"
}
{
  "type": "skip_response"
}
{
  "type": "end_call"
}

Server → Client Messages:
{
  "type": "transcription",
  "text": "नमस्ते",
  "language": "hi"
}
{
  "type": "ai_response",
  "text": "आपका स्वागत है",
  "intent": "greeting",
  "agents_used": ["conversation"]
}
{
  "type": "audio_response",
  "audio": "<base64_audio>",
  "format": "mp3"
}
{
  "type": "form_update",
  "fields_filled": 5,
  "total_fields": 10,
  "screenshot": "<base64_image>"
}
{
  "type": "status",
  "status": "listening|processing|speaking"
}
{
  "type": "error",
  "message": "Error description"
}
```

## Voice Pipeline Design

### Voice Processing Flow

```
User Speech
    ↓
MediaRecorder (Browser)
    ↓ Audio Chunks (WebM/Opus)
WebSocket Client
    ↓
Backend WebSocket Handler
    ↓
Audio Buffer Accumulation
    ↓
Sarvam AI STT (Saarika v2)
    ↓ Transcribed Text + Language
Agent Orchestrator
    ↓
Bedrock LLM (Mistral Large 3)
    ↓ AI Response Text
Sarvam AI TTS (Bulbul v3)
    ↓ Audio (MP3)
WebSocket → Client
    ↓
Audio Player (Browser)
    ↓
User Hears Response
```

### Voice Activity Detection (VAD)

```javascript
// Client-side VAD with noise filtering
const SILENCE_THRESHOLD = 0.025;      // Higher = less sensitive to silence
const SILENCE_DURATION_MS = 1200;     // Stop after 1.2s of silence
const MIN_RECORD_MS = 800;            // Require 800ms of audio before processing
const MIN_AUDIO_LENGTH = 2000;        // Minimum 2000 bytes to send
const NOISE_GATE_THRESHOLD = 0.02;    // Minimum RMS level for speech

const analyzeVolume = (audioData) => {
  // Compute RMS (Root Mean Square) volume
  const sum = audioData.reduce((acc, val) => acc + val * val, 0);
  const rms = Math.sqrt(sum / audioData.length);
  
  // Noise gate: filter out low-level background noise
  if (rms < NOISE_GATE_THRESHOLD) {
    consecutiveLowFrames++;
    if (consecutiveLowFrames > 10 && elapsed > MIN_RECORD_MS) {
      stopRecording(); // Discard background noise
      return;
    }
  }
  
  // Silence detection: stop after pause in speech
  if (rms < SILENCE_THRESHOLD && elapsed > MIN_RECORD_MS) {
    if (!silenceStart) silenceStart = Date.now();
    if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
      stopRecording();
      sendAudioToServer();
    }
  } else if (rms >= NOISE_GATE_THRESHOLD) {
    silenceStart = null; // Reset silence timer
  }
};

// Minimum audio length check before sending
recorder.onstop = async () => {
  const audioBlob = new Blob(chunks);
  const arrayBuffer = await audioBlob.arrayBuffer();
  
  if (arrayBuffer.byteLength >= MIN_AUDIO_LENGTH) {
    // Send to server for transcription
    websocket.send(arrayBuffer);
  } else {
    // Too short - likely background noise, discard
    console.log('Audio too short, discarding');
    resumeListening();
  }
};
```

**Features**:
- **Noise Gate**: Filters out background noise below threshold
- **Minimum Length**: Rejects audio clips < 2000 bytes
- **Silence Detection**: Stops recording after 1.2s of silence
- **Auto-Resume**: Continues listening after discarding noise
- **Interrupt Handling**: Stops AI speech when user starts speaking

## Multi-Agent System Design

### Agent Architecture

```
User Input
    ↓
Agent Orchestrator
    ↓
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ Conversation  │   Research    │     Form      │   Document    │
│    Agent      │    Agent      │    Agent      │    Agent      │
└───────┬───────┴───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │               │
        ↓               ↓               ↓               ↓
    General Chat   Scheme Search   Form Filling   OCR + Extract
    Intent Class   Eligibility     Browser Auto   Classification
    Routing        Matching        Screenshot     Data Extraction
```

### Agent Responsibilities

**Conversation Agent**:
- Handle greetings and casual conversation
- Classify user intent
- Route to appropriate agent
- Maintain conversation context
- Provide friendly responses

**Research Agent**:
- Search scheme database
- Check eligibility criteria
- Rank and recommend schemes
- Explain benefits and requirements
- Answer scheme-related questions

**Form Agent**:
- Navigate government portals
- Analyze form structure
- Fill form fields automatically
- Handle OTP/CAPTCHA
- Submit applications
- Capture screenshots

**Document Agent**:
- Process uploaded documents
- Perform OCR extraction
- Classify document types
- Extract structured data
- Validate extracted information
- Store in document vault

### Agent Coordination

```python
class AgentOrchestrator:
    def process_message(self, message: str, context: dict) -> dict:
        # 1. Classify intent
        intent = self.classify_intent(message, context)
        
        # 2. Select agents
        agents = self.select_agents(intent)
        
        # 3. Execute agents in sequence or parallel
        results = []
        for agent in agents:
            result = agent.execute(message, context)
            results.append(result)
            context.update(result.context_updates)
        
        # 4. Synthesize response
        response = self.synthesize_response(results, context)
        
        return response
```

## Form Filling Automation Design

### Browser Automation Architecture

```
Form Agent Service
    ↓
Playwright Browser (Chromium)
    ↓
Xvfb Virtual Display (:99)
    ↓
noVNC Server (Port 6080)
    ↓
Screenshot Capture
    ↓
WebSocket → Client
```

### Form Analysis Algorithm

```python
def analyze_form(page: Page) -> FormStructure:
    # 1. Identify all input fields
    inputs = page.query_selector_all('input, select, textarea')
    
    # 2. Extract field metadata
    fields = []
    for input in inputs:
        field = {
            'selector': get_selector(input),
            'type': input.get_attribute('type'),
            'name': input.get_attribute('name'),
            'label': find_label(input),
            'required': input.get_attribute('required') is not None,
            'placeholder': input.get_attribute('placeholder'),
            'options': get_options(input) if input.tag_name == 'select' else None
        }
        fields.append(field)
    
    # 3. Detect form sections
    sections = detect_sections(page)
    
    # 4. Identify submit button
    submit_button = find_submit_button(page)
    
    return FormStructure(fields, sections, submit_button)
```

### Field Filling Strategy

```python
def fill_field(field: FormField, value: any, page: Page):
    selector = field.selector
    
    if field.type == 'text' or field.type == 'email':
        page.fill(selector, str(value))
    
    elif field.type == 'select':
        # Try exact match first
        try:
            page.select_option(selector, value=value)
        except:
            # Fuzzy match on option text
            options = page.query_selector_all(f'{selector} option')
            best_match = find_best_match(value, options)
            page.select_option(selector, label=best_match)
    
    elif field.type == 'radio':
        page.check(f'{selector}[value="{value}"]')
    
    elif field.type == 'checkbox':
        if value:
            page.check(selector)
        else:
            page.uncheck(selector)
    
    elif field.type == 'file':
        # NEW: Auto-upload from document vault
        document = match_document_to_field(field.label, user_documents)
        if document:
            # Download from S3
            file_content = s3_service.download_file(document['s3_key'])
            temp_path = f"/tmp/{document['original_filename']}"
            with open(temp_path, 'wb') as f:
                f.write(file_content)
            
            # Upload via Playwright
            page.set_input_files(selector, temp_path)
            
            # Clean up
            os.remove(temp_path)
        else:
            # Document not found - prompt user
            prompt_user_to_upload(field.label)
    
    # Wait for any dynamic updates
    page.wait_for_timeout(500)
```

### Document Upload Matching

```python
def match_document_to_field(field_label: str, user_docs: list) -> dict:
    """
    Match file upload field to user's document based on keywords.
    
    Examples:
    - "Upload Aadhaar Card" → aadhaar document
    - "Income Certificate" → income_certificate document
    - "10th Marksheet" → marksheet_10th document
    """
    label_lower = field_label.lower()
    
    # Document type keyword mappings
    doc_keywords = {
        "aadhaar": ["aadhaar", "aadhar", "uid", "identity"],
        "pan": ["pan", "pan card", "permanent account"],
        "income_certificate": ["income", "income certificate"],
        "marksheet_10th": ["10th", "tenth", "sslc", "matriculation"],
        "marksheet_12th": ["12th", "twelfth", "hsc", "intermediate"],
        "bank_passbook": ["bank", "passbook", "bank statement"],
        "caste_certificate": ["caste", "community certificate"],
        "land_record": ["land", "property", "7/12", "khata"],
        # ... more mappings
    }
    
    # Find matching document
    for doc_type, keywords in doc_keywords.items():
        if any(kw in label_lower for kw in keywords):
            for doc in user_docs:
                if doc['document_type'] == doc_type:
                    return doc
    
    return None
```

## Document Processing Pipeline

### OCR Pipeline

```
Document Upload (PDF/Image)
    ↓
S3 Storage
    ↓
AWS Textract (Async Job)
    ↓
Raw OCR Blocks
    ↓
Post-Processing
    ├── Error Correction
    ├── Text Cleaning
    └── Layout Analysis
    ↓
Cleaned Text
    ↓
Document Classification (Bedrock)
    ↓
Structured Data Extraction (Bedrock)
    ↓
Validation & Confidence Scoring
    ↓
Store in DynamoDB
```

### Document Classification

```python
def classify_document(text: str) -> tuple[str, float]:
    prompt = f"""
    Classify this document into one of these types:
    - aadhaar: Aadhaar card
    - pan: PAN card
    - income: Income certificate
    - caste: Caste certificate
    - domicile: Domicile certificate
    - birth: Birth certificate
    - education: Educational certificate
    - other: Other document
    
    Document text:
    {text[:1000]}
    
    Return JSON: {{"type": "...", "confidence": 0.0-1.0}}
    """
    
    response = bedrock_service.chat(prompt)
    result = json.loads(response)
    return result['type'], result['confidence']
```

### Data Extraction

```python
def extract_data(text: str, doc_type: str) -> dict:
    schemas = {
        'aadhaar': ['name', 'aadhaar_number', 'dob', 'gender', 'address'],
        'pan': ['name', 'pan_number', 'dob', 'father_name'],
        'income': ['name', 'annual_income', 'issue_date', 'issuing_authority'],
        # ... more schemas
    }
    
    fields = schemas.get(doc_type, [])
    
    prompt = f"""
    Extract these fields from the document:
    {', '.join(fields)}
    
    Document text:
    {text}
    
    Return JSON with extracted values. Use null for missing fields.
    """
    
    response = bedrock_service.chat(prompt)
    return json.loads(response)
```

## Security Design

### Authentication Flow

```
User → Phone Number
    ↓
Backend → Generate OTP
    ↓
Twilio → Send SMS
    ↓
User → Enter OTP
    ↓
Backend → Verify OTP
    ↓
Backend → Generate JWT
    ↓
Client → Store JWT
    ↓
Client → Include JWT in requests
    ↓
Backend → Verify JWT
    ↓
Backend → Process Request
```

### JWT Token Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "user_id": "uuid",
    "phone": "+91XXXXXXXXXX",
    "exp": 1234567890,
    "iat": 1234567890
  },
  "signature": "..."
}
```

### Data Encryption

**At Rest**:
- S3: AES-256 encryption
- DynamoDB: Encryption at rest enabled
- Secrets: AWS Secrets Manager

**In Transit**:
- HTTPS for all API calls
- WSS for WebSocket connections
- TLS 1.2+ required

### Access Control

```python
# JWT verification middleware
async def verify_token(request: Request):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        request.state.user_id = payload['user_id']
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
```

## Deployment Architecture

### AWS Infrastructure

```
Route 53 (DNS)
    ↓
CloudFront (CDN)
    ├── S3 (Frontend)
    └── ALB (Backend)
        ↓
    ECS Fargate Cluster
        ├── Task 1 (Backend Container)
        ├── Task 2 (Backend Container)
        └── Task N (Auto-scaling)
            ↓
        ┌───────────────────────────────┐
        │  Container Components:        │
        │  - FastAPI App                │
        │  - Xvfb (Virtual Display)     │
        │  - Chromium Browser           │
        │  - noVNC Server               │
        │  - Supervisord (Process Mgr)  │
        └───────────────────────────────┘
```

### Container Configuration

```dockerfile
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    chromium \
    chromium-driver \
    supervisor

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN playwright install chromium --with-deps

# Copy application
COPY app/ /app/

# Supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/

# Start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8000 6080 5900

CMD ["/start.sh"]
```

### Supervisord Configuration

```ini
[supervisord]
nodaemon=true

[program:xvfb]
command=Xvfb :99 -screen 0 1920x1080x24
autostart=true
autorestart=true

[program:x11vnc]
command=x11vnc -display :99 -forever -shared
autostart=true
autorestart=true

[program:novnc]
command=novnc --vnc localhost:5900 --listen 6080
autostart=true
autorestart=true

[program:fastapi]
command=uvicorn app.main:app --host 0.0.0.0 --port 8000
directory=/app
autostart=true
autorestart=true
environment=DISPLAY=":99"
```

## Performance Optimization

### Caching Strategy

```python
# Scheme data caching
@lru_cache(maxsize=100)
def get_scheme(scheme_id: str) -> Scheme:
    return db.get_scheme(scheme_id)

# User profile caching
cache = {}
def get_user_cached(user_id: str) -> User:
    if user_id in cache:
        return cache[user_id]
    user = db.get_user(user_id)
    cache[user_id] = user
    return user
```

### Database Optimization

```python
# DynamoDB query optimization
# Use GSI for common queries
table.query(
    IndexName='UserPhoneIndex',
    KeyConditionExpression=Key('phone_number').eq(phone)
)

# Batch operations
with table.batch_writer() as batch:
    for item in items:
        batch.put_item(Item=item)
```

### API Response Optimization

```python
# Streaming responses for large data
async def stream_response():
    for chunk in large_data:
        yield chunk
        await asyncio.sleep(0)

# Pagination
@router.get("/schemes/")
async def list_schemes(limit: int = 20, last_key: str = None):
    result = db.scan_schemes(limit, last_key)
    return {
        "items": result['items'],
        "next_key": result.get('last_evaluated_key')
    }
```

## Monitoring & Logging

### Logging Strategy

```python
import logging

logger = logging.getLogger(__name__)

# Structured logging
logger.info("User authenticated", extra={
    "user_id": user_id,
    "method": "phone_otp",
    "ip": request.client.host
})

# Error logging with context
try:
    result = process_document(file)
except Exception as e:
    logger.error("Document processing failed", extra={
        "user_id": user_id,
        "document_id": doc_id,
        "error": str(e)
    }, exc_info=True)
```

### Metrics Collection

```python
# Custom metrics
from prometheus_client import Counter, Histogram

voice_calls = Counter('voice_calls_total', 'Total voice calls')
response_time = Histogram('response_time_seconds', 'Response time')

@response_time.time()
async def process_voice():
    voice_calls.inc()
    # ... processing
```

### Health Checks

```python
@app.get("/health")
async def health_check():
    checks = {
        "database": check_dynamodb(),
        "storage": check_s3(),
        "llm": check_bedrock(),
        "stt_tts": check_sarvam()
    }
    
    all_healthy = all(checks.values())
    status_code = 200 if all_healthy else 503
    
    return JSONResponse(
        status_code=status_code,
        content={"status": "healthy" if all_healthy else "unhealthy", "checks": checks}
    )
```

## Testing Strategy

### Unit Tests
```python
def test_classify_intent():
    orchestrator = AgentOrchestrator()
    intent = orchestrator.classify_intent("I want to apply for scholarship", {})
    assert intent == "scheme_discovery"

def test_extract_aadhaar():
    text = "Name: John Doe\nAadhaar: 1234 5678 9012"
    data = extract_data(text, 'aadhaar')
    assert data['name'] == "John Doe"
    assert data['aadhaar_number'] == "123456789012"
```

### Integration Tests
```python
@pytest.mark.asyncio
async def test_voice_pipeline():
    # Mock audio input
    audio_data = load_test_audio()
    
    # Send to WebSocket
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({
            "type": "audio_chunk",
            "data": base64.b64encode(audio_data).decode()
        }))
        
        # Expect transcription
        response = await ws.recv()
        assert response['type'] == 'transcription'
```

### E2E Tests
```python
def test_complete_application_flow():
    # 1. Authenticate
    token = authenticate_user(phone)
    
    # 2. Upload documents
    doc_id = upload_document(token, aadhaar_file)
    
    # 3. Start application
    app_id = start_application(token, scheme_id)
    
    # 4. Fill form
    fill_form(token, app_id, form_data)
    
    # 5. Submit
    result = submit_application(token, app_id)
    assert result['status'] == 'submitted'
```

## Error Handling

### Error Categories

```python
class CivicBridgeError(Exception):
    """Base exception"""
    pass

class AuthenticationError(CivicBridgeError):
    """Authentication failed"""
    pass

class DocumentProcessingError(CivicBridgeError):
    """Document processing failed"""
    pass

class FormFillingError(CivicBridgeError):
    """Form filling failed"""
    pass

class ExternalServiceError(CivicBridgeError):
    """External service unavailable"""
    pass
```

### Error Response Format

```json
{
  "error": {
    "code": "DOCUMENT_PROCESSING_FAILED",
    "message": "Failed to extract text from document",
    "details": {
      "document_id": "uuid",
      "reason": "Low image quality"
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

## Scalability Considerations

### Horizontal Scaling
- ECS Fargate auto-scaling based on CPU/memory
- ALB distributes traffic across tasks
- Stateless backend design
- WebSocket sticky sessions

### Database Scaling
- DynamoDB on-demand capacity mode
- GSI for efficient queries
- Batch operations for bulk writes
- Connection pooling

### Caching
- CloudFront for static assets
- In-memory caching for frequently accessed data
- Redis for session storage (future)

### Async Processing
- Background jobs for document processing
- Queue-based form filling
- Webhook callbacks for status updates

## Future Enhancements

### Phase 2 Features
- WhatsApp bot integration
- SMS-based interface
- Offline mode with sync
- Multi-user family accounts
- Advanced analytics dashboard

### Technical Improvements
- GraphQL API
- Real-time collaboration
- Video call support
- Advanced caching with Redis
- Microservices architecture
- Kubernetes deployment

## Document Control

- **Version**: 1.0
- **Last Updated**: 2024-01-15
- **Author**: CivicBridge Team
- **Status**: Active
- **Next Review**: 2024-04-15
