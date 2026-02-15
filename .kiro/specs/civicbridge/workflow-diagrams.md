# Sarvabhasha Sahayak - Workflow Diagrams

## 1. End-to-End User Journey Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INITIATES CONTACT                       │
│                    (Voice/Text in Local Language)                    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1: INTENT UNDERSTANDING                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Whisper API / Google STT (Voice → Text)                  │    │
│  │ • Groq LLM analyzes intent                                 │    │
│  │ • Detects: Need type, urgency, user context               │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 2: SCHEME IDENTIFICATION                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Query Scheme Registry (PostgreSQL)                       │    │
│  │ • Groq LLM matches user profile to eligibility criteria    │    │
│  │ • Returns ranked list of eligible schemes                  │    │
│  │ • Explains each scheme in user's language                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  User selects scheme → Conversation stored in Redis                 │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   STEP 3: DOCUMENT READINESS CHECK                   │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Fetch required documents for selected scheme             │    │
│  │ • Check Document Vault (PostgreSQL + S3)                   │    │
│  │ • Status: ✅ Available | ❌ Missing | ⚠️ Expired           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  IF MISSING DOCUMENTS:                                               │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Guide user on how to obtain document                     │    │
│  │ • Wait for upload                                          │    │
│  │ • Process uploaded document (see Document Processing Flow) │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 4: BACKGROUND FORM FILLING (AUTOMATION)            │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Playwright Browser Automation Starts                       │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ 1. Load scheme portal URL                                  │    │
│  │ 2. Navigate to registration page                           │    │
│  │ 3. Extract form fields (DOM inspection)                    │    │
│  │ 4. Map fields to document data                             │    │
│  │ 5. Fill fields programmatically                            │    │
│  │ 6. Upload document files where required                    │    │
│  │ 7. Handle dropdowns, date pickers, checkboxes              │    │
│  │ 8. Take screenshot after each page                         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  AFTER EACH PAGE:                                                    │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Screenshot saved to S3                                   │    │
│  │ • Groq LLM generates summary of filled data                │    │
│  │ • User shown: "I filled these details, correct?"           │    │
│  │ • User confirms ✅ or corrects ✏️                          │    │
│  │ • Only proceed after approval                              │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 5: SECURITY CHECK HANDLING (PAUSE/RESUME)          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ CAPTCHA / OTP DETECTED                                     │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • Automation PAUSES immediately                            │    │
│  │ • Browser state serialized and saved to Redis              │    │
│  │ • User notified: "Please enter OTP sent to 98XXXX1234"    │    │
│  │ • User provides OTP via chat                               │    │
│  │ • System submits OTP                                       │    │
│  │ • Browser state restored from Redis                        │    │
│  │ • Automation RESUMES from exact point                      │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  NO BYPASSING - FULLY COMPLIANT                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 6: FINAL SUBMISSION                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Groq LLM generates complete application summary          │    │
│  │ • Shows all filled data, uploaded documents                │    │
│  │ • Asks: "Ready to submit? This cannot be undone."          │    │
│  │ • User gives EXPLICIT CONSENT                              │    │
│  │ • Playwright clicks submit button                          │    │
│  │ • Captures confirmation page                               │    │
│  │ • Extracts application ID                                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  AUTO-SAVE CONFIRMATION:                                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Download acknowledgment receipt (if available)           │    │
│  │ • Save to Document Vault (S3)                              │    │
│  │ • Auto-classify as "Application Receipt"                   │    │
│  │ • Link to application record in PostgreSQL                 │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 7: POST-SUBMISSION TRACKING                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Application record created in PostgreSQL                 │    │
│  │ • Status: "Submitted" with timestamp                       │    │
│  │ • User receives confirmation message in their language     │    │
│  │ • Email monitoring service activated                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ONGOING MONITORING:                                                 │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Email Monitor checks inbox every 15 minutes              │    │
│  │ • Detects status update emails from government             │    │
│  │ • Parses email content (approval/rejection/action needed)  │    │
│  │ • Translates to user's language                            │    │
│  │ • Sends WhatsApp notification via Twilio API               │    │
│  │ • Updates application status in database                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         JOURNEY COMPLETE                             │
│              User receives benefit / takes corrective action         │
└─────────────────────────────────────────────────────────────────────┘


---

## 2. Document Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DOCUMENT UPLOAD TRIGGER                         │
│              (User uploads file via mobile app/web)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: FILE VALIDATION                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Check file type (PDF, JPG, PNG)                          │    │
│  │ • Check file size (<10MB)                                  │    │
│  │ • Virus scan (optional)                                    │    │
│  │ • Generate unique document ID                              │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  IF INVALID → Reject with error message                              │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 2: STORAGE                                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Upload to S3 / GCS (free tier)                           │    │
│  │ • Path: /documents/{user_id}/{doc_id}/{filename}           │    │
│  │ • Generate secure access URL                               │    │
│  │ • Store metadata in PostgreSQL                             │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: OCR EXTRACTION                           │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ PRIMARY: Google ML Kit OCR                                 │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • Fast, accurate for Indian documents                      │    │
│  │ • Handles Hindi, Tamil, Telugu, English                    │    │
│  │ • Returns structured text with bounding boxes              │    │
│  │                                                            │    │
│  │ BACKUP: Azure Computer Vision OCR                          │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • Used if Google ML Kit fails                              │    │
│  │ • Free tier sufficient for hackathon                       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  OUTPUT: Raw OCR text                                                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STAGE 4: DOCUMENT CLASSIFICATION (LLM)                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Groq LLM Classification Prompt:                            │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ "Analyze this OCR text and identify the document type:    │    │
│  │  - Aadhaar Card                                           │    │
│  │  - Income Certificate                                     │    │
│  │  - Marksheet (10th/12th/Degree)                          │    │
│  │  - Bank Passbook                                          │    │
│  │  - Caste Certificate                                      │    │
│  │  - Land Records                                           │    │
│  │  - Other                                                  │    │
│  │                                                           │    │
│  │  Return: {type: string, confidence: float, reasoning: str}"│   │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  IF CONFIDENCE < 0.8 → Ask user to confirm document type             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STAGE 5: DATA EXTRACTION (LLM)                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Groq LLM Extraction Prompt (Type-Specific):                │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ FOR AADHAAR:                                              │    │
│  │ "Extract: Name, DOB, Gender, Aadhaar Number, Address"    │    │
│  │                                                           │    │
│  │ FOR INCOME CERTIFICATE:                                   │    │
│  │ "Extract: Annual Income, Certificate Number, Valid Until"│    │
│  │                                                           │    │
│  │ FOR MARKSHEET:                                            │    │
│  │ "Extract: Name, Roll No, Marks, Percentage, Year, Board" │    │
│  │                                                           │    │
│  │ Return as structured JSON                                 │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  VALIDATION:                                                         │
│  • Check for required fields                                         │
│  • Validate formats (Aadhaar: 12 digits, IFSC: 11 chars, etc.)      │
│  • Flag anomalies for user review                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STAGE 6: INTELLIGENT RENAMING                           │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Groq LLM Naming Prompt:                                    │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ "Generate a filename using this pattern:                  │    │
│  │  {PersonName}_{DocumentType}_{Year}.{ext}                │    │
│  │                                                           │    │
│  │  Extracted Data: {json_data}                             │    │
│  │  Original: income_cert_scan.pdf                          │    │
│  │  New: Priya_Kumar_Income_Certificate_2024.pdf"           │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  • Update filename in S3 and PostgreSQL                              │
│  • User can manually rename if needed                                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STAGE 7: DUPLICATE DETECTION                            │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Generate document hash (SHA-256)                         │    │
│  │ • Check against existing documents in vault                │    │
│  │ • Exact match → Reject duplicate                           │    │
│  │                                                            │    │
│  │ • Generate embedding (Groq LLM)                            │    │
│  │ • Cosine similarity with existing docs                     │    │
│  │ • Similarity > 0.95 → Flag as potential duplicate          │    │
│  │ • Ask user: "Similar document exists. Replace or keep both?"│   │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STAGE 8: VAULT STORAGE & INDEXING                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ PostgreSQL Record:                                         │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • document_id                                              │    │
│  │ • user_id                                                  │    │
│  │ • document_type (classified)                               │    │
│  │ • extracted_data (JSON)                                    │    │
│  │ • s3_url                                                   │    │
│  │ • ai_generated_name                                        │    │
│  │ • upload_timestamp                                         │    │
│  │ • source (user_upload / auto_download)                     │    │
│  │ • is_verified (boolean)                                    │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  • Document now available for form filling                           │
│  • Searchable by type, name, date                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    USER NOTIFICATION                                 │
│  "✅ Document processed: Priya_Kumar_Income_Certificate_2024.pdf"   │
│  "Type: Income Certificate | Annual Income: ₹1,20,000"              │
└─────────────────────────────────────────────────────────────────────┘

---

## 3. Browser Automation Flow (Playwright)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTOMATION SESSION START                          │
│  Input: scheme_id, user_data, document_vault                        │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 1: LOAD SCHEME CONFIGURATION                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Fetch scheme config from PostgreSQL                      │    │
│  │ • Contains: portal_url, field_mappings, selectors          │    │
│  │ • Load navigation steps                                    │    │
│  │ • Initialize Playwright browser (headless)                 │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 2: NAVIGATE TO PORTAL                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ await page.goto(scheme.portal_url)                         │    │
│  │ await page.waitForLoadState('networkidle')                 │    │
│  │ • Handle cookie consent popups                             │    │
│  │ • Click "New Registration" / "Apply Now"                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 3: PAGE-BY-PAGE FORM FILLING                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ FOR EACH PAGE in scheme.steps:                             │    │
│  │                                                            │    │
│  │   FOR EACH FIELD in page.fields:                          │    │
│  │     • Get field selector (CSS/XPath)                      │    │
│  │     • Get data source (e.g., "aadhaar.name")              │    │
│  │     • Extract value from document vault                   │    │
│  │     • Fill field based on type:                           │    │
│  │       - text: await input.fill(value)                     │    │
│  │       - select: await dropdown.selectOption(value)        │    │
│  │       - date: await datepicker.fill(formatted_date)       │    │
│  │       - file: await input.setInputFiles(file_path)        │    │
│  │       - checkbox: await checkbox.check()                  │    │
│  │                                                           │    │
│  │   • Take screenshot: await page.screenshot()              │    │
│  │   • Save to S3                                            │    │
│  │   • Generate summary via Groq LLM                         │    │
│  │   • PAUSE for user verification                           │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 4: USER VERIFICATION CHECKPOINT                    │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Show screenshot to user                                  │    │
│  │ • LLM-generated summary:                                   │    │
│  │   "I filled:                                              │    │
│  │    - Name: Priya Kumar                                    │    │
│  │    - DOB: 15/08/2005                                      │    │
│  │    - Category: OBC                                        │    │
│  │    - Annual Income: ₹1,20,000                             │    │
│  │   Is this correct?"                                       │    │
│  │                                                           │    │
│  │ • Wait for user response                                  │    │
│  │ • IF user corrects → Update data, refill page             │    │
│  │ • IF user approves → Click "Next" / "Continue"            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  • Serialize browser state to Redis (for pause/resume)               │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 5: SECURITY CHECK DETECTION                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ CAPTCHA Detection:                                         │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • Check for: img[alt*="captcha"], .captcha-image          │    │
│  │ • If found → PAUSE automation                             │    │
│  │ • Notify user: "Please solve CAPTCHA"                     │    │
│  │ • Show CAPTCHA image                                      │    │
│  │ • Wait for user input                                     │    │
│  │ • Submit CAPTCHA value                                    │    │
│  │                                                           │    │
│  │ OTP Detection:                                            │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ • Check for: input[name*="otp"], #otp_input               │    │
│  │ • If found → PAUSE automation                             │    │
│  │ • Notify user: "Enter OTP sent to 98XXXX1234"            │    │
│  │ • Wait for user input                                     │    │
│  │ • Fill OTP field                                          │    │
│  │ • Click verify button                                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  • Browser state saved to Redis during pause                         │
│  • Restored after user provides input                                │
│  • RESUME automation seamlessly                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 6: FINAL SUBMISSION                                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • All pages filled and verified                            │    │
│  │ • Generate complete summary via Groq LLM                   │    │
│  │ • Show to user with explicit consent request               │    │
│  │ • Wait for "YES, SUBMIT" confirmation                      │    │
│  │                                                            │    │
│  │ • await page.click('button[type="submit"]')                │    │
│  │ • await page.waitForNavigation()                           │    │
│  │ • Capture confirmation page                                │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 7: POST-SUBMISSION ACTIONS                         │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Extract application ID from confirmation page            │    │
│  │ • Download acknowledgment receipt (if available)           │    │
│  │ • Save receipt to Document Vault (auto-classified)         │    │
│  │ • Create application record in PostgreSQL                  │    │
│  │ • Close browser session                                    │    │
│  │ • Notify user of successful submission                     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTOMATION COMPLETE                               │
│  Application tracking begins (Email Monitor + WhatsApp Notifier)    │
└─────────────────────────────────────────────────────────────────────┘


---

## 4. Email Monitoring & WhatsApp Notification Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EMAIL MONITOR SERVICE (Background)                │
│                    Runs every 15 minutes (Cron Job)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 1: CONNECT TO EMAIL INBOX                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • IMAP connection to user's email (with consent)           │    │
│  │ • OR monitor dedicated forwarding inbox                    │    │
│  │ • Fetch unread emails from last 24 hours                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 2: FILTER GOVERNMENT EMAILS                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Check sender domain:                                     │    │
│  │   - *.gov.in                                              │    │
│  │   - *.nic.in                                              │    │
│  │   - scholarships.gov.in                                   │    │
│  │   - nsp.gov.in                                            │    │
│  │   - ayushman.gov.in                                       │    │
│  │   - etc.                                                  │    │
│  │                                                           │    │
│  │ • Ignore non-government emails                            │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 3: PARSE EMAIL CONTENT                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Groq LLM Parsing Prompt:                                   │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ "Analyze this government email and extract:              │    │
│  │  - Application ID / Reference Number                     │    │
│  │  - Status (approved/rejected/pending/action_required)    │    │
│  │  - Scheme name                                           │    │
│  │  - Key details (amount, deadline, reason, etc.)          │    │
│  │  - Action required (if any)                              │    │
│  │                                                          │    │
│  │  Email Subject: {subject}                                │    │
│  │  Email Body: {body}                                      │    │
│  │                                                          │    │
│  │  Return as JSON"                                         │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 4: MATCH TO APPLICATION RECORD                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ • Query PostgreSQL for application by ID                   │    │
│  │ • If not found → Create new tracking record                │    │
│  │ • Get user_id and preferred_language                       │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 5: TRANSLATE TO USER LANGUAGE                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Groq LLM Translation Prompt:                               │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ "Translate this notification to {user_language}:          │    │
│  │  Keep it simple, conversational, and clear.              │    │
│  │  Use appropriate emojis.                                 │    │
│  │                                                          │    │
│  │  Status: {status}                                        │    │
│  │  Details: {parsed_data}                                  │    │
│  │                                                          │    │
│  │  Template: {notification_template}"                      │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  Example Output (Hindi):                                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ ✅ शुभ समाचार!                                            │    │
│  │                                                            │    │
│  │ आपका छात्रवृत्ति आवेदन स्वीकृत हो गया है।                │    │
│  │                                                            │    │
│  │ आवेदन संख्या: NSP2024123456                               │    │
│  │ राशि: ₹10,000                                              │    │
│  │ खाते में जमा: 7 दिनों में                                  │    │
│  │                                                            │    │
│  │ बधाई हो! 🎉                                                │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 6: SEND WHATSAPP NOTIFICATION                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Twilio WhatsApp API Call:                                  │    │
│  │ ─────────────────────────────────────────────────────────  │    │
│  │ POST https://api.twilio.com/2010-04-01/Accounts/{SID}/    │    │
│  │      Messages.json                                         │    │
│  │                                                            │    │
│  │ Body:                                                      │    │
│  │ {                                                          │    │
│  │   "From": "whatsapp:+14155238886",                        │    │
│  │   "To": "whatsapp:+91{user_phone}",                       │    │
│  │   "Body": "{translated_message}"                          │    │
│  │ }                                                          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  • Log notification in PostgreSQL                                    │
│  • Mark email as processed                                           │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 7: UPDATE APPLICATION STATUS                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ UPDATE applications SET                                    │    │
│  │   status = {new_status},                                   │    │
│  │   last_updated = NOW(),                                    │    │
│  │   status_history = status_history || {new_entry}           │    │
│  │ WHERE application_id = {app_id}                            │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│              USER RECEIVES WHATSAPP NOTIFICATION                     │
│  User can reply to WhatsApp to:                                     │
│  • Check status                                                      │
│  • Ask questions                                                     │
│  • Start new application                                             │
└─────────────────────────────────────────────────────────────────────┘


---

## 5. System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Mobile    │  │  WhatsApp   │  │     Web     │  │   Voice     │     │
│  │     App     │  │     Bot     │  │   Portal    │  │  Interface  │     │
│  │ (React      │  │  (Twilio)   │  │  (React)    │  │  (Whisper)  │     │
│  │  Native)    │  │             │  │             │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌───────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    FastAPI REST API Server                       │     │
│  │  • Authentication & Authorization (JWT)                          │     │
│  │  • Rate Limiting                                                 │     │
│  │  • Request Validation (Pydantic)                                 │     │
│  │  • WebSocket Support (real-time updates)                         │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌───────────────────────────────────────────────────────────────────────────┐
│                          CORE SERVICES LAYER                               │
│                                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐                      │
│  │  Conversation        │  │  AI Agent Engine     │                      │
│  │  Manager             │  │  ┌────────────────┐  │                      │
│  │  • Session mgmt      │  │  │  Groq LLM      │  │                      │
│  │  • Memory isolation  │  │  │  (LLaMA-3-70B) │  │                      │
│  │  • Language detect   │  │  └────────────────┘  │                      │
│  │  • Redis cache       │  │  • ReAct pattern    │                      │
│  └──────────────────────┘  │  • Tool calling     │                      │
│                            │  • Intent parsing   │                      │
│                            └──────────────────────┘                      │
│                                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐                      │
│  │  Document            │  │  Browser Automation  │                      │
│  │  Intelligence        │  │  Agent               │                      │
│  │  ┌────────────────┐  │  │  ┌────────────────┐  │                      │
│  │  │ Google ML Kit  │  │  │  │  Playwright    │  │                      │
│  │  │ OCR            │  │  │  │  (Headless)    │  │                      │
│  │  └────────────────┘  │  │  └────────────────┘  │                      │
│  │  • Classification    │  │  • Form filling     │                      │
│  │  • Data extraction   │  │  • Screenshot       │                      │
│  │  • Duplicate detect  │  │  • Pause/Resume     │                      │
│  └──────────────────────┘  └──────────────────────┘                      │
│                                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐                      │
│  │  Scheme Registry     │  │  Email Monitor &     │                      │
│  │  & Matching          │  │  Notifier            │                      │
│  │  • Eligibility check │  │  • IMAP client       │                      │
│  │  • Scheme database   │  │  • Email parsing     │                      │
│  │  • Config mgmt       │  │  • WhatsApp sender   │                      │
│  └──────────────────────┘  └──────────────────────┘                      │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌───────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Redis     │  │ PostgreSQL  │  │     S3      │  │   Celery    │     │
│  │             │  │             │  │   / GCS     │  │   Queue     │     │
│  │ • Sessions  │  │ • Users     │  │             │  │             │     │
│  │ • Cache     │  │ • Schemes   │  │ • Documents │  │ • Async     │     │
│  │ • Browser   │  │ • Apps      │  │ • Screenshots│ │   tasks     │     │
│  │   state     │  │ • Docs meta │  │ • Receipts  │  │ • Workers   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌───────────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL INTEGRATIONS                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Government  │  │   Twilio    │  │   Google    │  │    Azure    │     │
│  │  Portals    │  │  WhatsApp   │  │   ML Kit    │  │  Computer   │     │
│  │             │  │     API     │  │     OCR     │  │   Vision    │     │
│  │ • NSP       │  │             │  │             │  │             │     │
│  │ • Ayushman  │  │             │  │             │  │             │     │
│  │ • State     │  │             │  │             │  │             │     │
│  │   portals   │  │             │  │             │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow Diagram

```
USER INPUT (Voice/Text)
         ↓
    [Speech-to-Text]
         ↓
    Groq LLM (Intent Understanding)
         ↓
    ┌─────────────────┐
    │ What does user  │
    │ want?           │
    └─────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │ • Apply for scheme                  │
    │ • Check status                      │
    │ • Upload document                   │
    │ • Ask question                      │
    └─────────────────────────────────────┘
         ↓
    [Route to appropriate service]
         ↓
┌────────────────────────────────────────────┐
│ APPLY FOR SCHEME FLOW                      │
│                                            │
│ 1. Scheme Matching                         │
│    ↓                                       │
│ 2. Document Check                          │
│    ↓                                       │
│ 3. OCR + Data Extraction                   │
│    ↓                                       │
│ 4. Browser Automation                      │
│    ↓                                       │
│ 5. User Verification (each page)           │
│    ↓                                       │
│ 6. Security Checks (OTP/CAPTCHA)           │
│    ↓                                       │
│ 7. Final Submission                        │
│    ↓                                       │
│ 8. Confirmation + Auto-save Receipt        │
└────────────────────────────────────────────┘
         ↓
    [Application Tracking Begins]
         ↓
┌────────────────────────────────────────────┐
│ BACKGROUND MONITORING                      │
│                                            │
│ Email Monitor (every 15 min)               │
│    ↓                                       │
│ Parse Status Update                        │
│    ↓                                       │
│ Translate to User Language                 │
│    ↓                                       │
│ Send WhatsApp Notification                 │
│    ↓                                       │
│ Update Database                            │
└────────────────────────────────────────────┘
         ↓
    USER RECEIVES UPDATE
```

---

## 7. Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **IDE** | Kiro IDE | Development environment |
| **Backend** | Python 3.11 + FastAPI | REST API server |
| **LLM** | Groq API (LLaMA-3-70B) | Ultra-fast agent reasoning |
| **Agent Framework** | LangChain / Custom | Tool orchestration |
| **OCR** | Google ML Kit / Azure OCR | Document text extraction |
| **Browser Automation** | Playwright | Headless form filling |
| **Memory** | Redis | Session state, cache |
| **Database** | PostgreSQL | Persistent data |
| **Storage** | AWS S3 / GCP Cloud Storage | Documents, screenshots |
| **Voice** | Whisper API / Google STT | Speech-to-text |
| **TTS** | Google TTS / Azure TTS | Text-to-speech |
| **Messaging** | Twilio WhatsApp API | Notifications |
| **Task Queue** | Celery + Redis | Async processing |
| **Deployment** | Docker + Free Cloud Tier | Containerized services |

---

## 8. Performance Characteristics

| Operation | Expected Latency | Notes |
|-----------|-----------------|-------|
| LLM Response (Groq) | 200-500ms | Hardware-accelerated |
| OCR Processing | 1-3 seconds | Per document |
| Document Classification | 300-800ms | LLM-based |
| Browser Page Fill | 2-5 seconds | Per page |
| WhatsApp Notification | 1-2 seconds | Via Twilio |
| Email Check | 5-10 seconds | Every 15 min |
| End-to-End Application | 5-15 minutes | Depends on form complexity |

---

## 9. Security & Privacy Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER DATA PROTECTION                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. DATA COLLECTION (Explicit Consent)                       │
│    • User agrees to terms                                   │
│    • Consent logged with timestamp                          │
│    • User can revoke anytime                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. DATA STORAGE (Encryption)                                │
│    • Documents: AES-256 encryption at rest                  │
│    • Database: Encrypted fields for sensitive data          │
│    • TLS 1.3 for data in transit                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. DATA ACCESS (Role-Based)                                 │
│    • User can only access their own data                    │
│    • Admin access logged in audit trail                     │
│    • No cross-user data leakage                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. DATA USAGE (Conversation Isolation)                      │
│    • Each conversation has isolated memory                  │
│    • Universal memory requires explicit opt-in              │
│    • No silent data reuse                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. DATA DELETION (User Control)                             │
│    • User can delete documents anytime                      │
│    • User can delete conversations                          │
│    • Permanent deletion (not soft delete)                   │
└─────────────────────────────────────────────────────────────┘
```


---

## 10. MVP vs Production Stack Comparison

### 10.1 Infrastructure Comparison

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MVP STACK (FREE TIER)                        │
│                    Perfect for Hackathon & Demo                      │
└─────────────────────────────────────────────────────────────────────┘

LLM:              Groq API (Free Tier)
                  • 14,400 requests/day
                  • LLaMA-3-70B, Mixtral
                  • Response: 200-500ms

OCR:              Google ML Kit (Free Tier)
                  • 1,000 requests/month
                  • Processing: 2-4 seconds

Voice STT:        Google Speech-to-Text (Free Tier)
                  • 60 minutes/month
                  • Latency: 3-5 seconds

Voice TTS:        Google TTS (Free Tier)
                  • 1M characters/month
                  • Latency: 2-3 seconds

Storage:          AWS S3 Free Tier
                  • 5GB storage
                  • 20,000 GET requests/month

Database:         PostgreSQL (Supabase Free Tier)
                  • 500MB database
                  • Unlimited API requests

Memory:           Redis Cloud Free Tier
                  • 30MB memory

WhatsApp:         Twilio Sandbox (Free)
                  • Testing only
                  • No production use

Deployment:       Render / Railway Free Tier
                  • 750 hours/month
                  • 512MB RAM

COST:             $0/month (100% free)
CAPACITY:         100-1,000 users
DEMO CAPABILITY:  ✅ Perfect for hackathon

┌─────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION STACK (PREMIUM)                      │
│                    For Scale & Enterprise Use                        │
└─────────────────────────────────────────────────────────────────────┘

LLM:              OpenAI GPT-4 Turbo / Claude 3 Opus
                  • Unlimited requests
                  • Higher accuracy
                  • Response: 100-300ms (2x faster)

OCR:              Google Document AI / AWS Textract
                  • Unlimited requests
                  • Advanced layout understanding
                  • Processing: 1-2 seconds (2x faster)

Voice STT:        Deepgram (Real-time)
                  • Unlimited minutes
                  • Ultra-low latency
                  • Latency: 0.5-1 second (5x faster)

Voice TTS:        ElevenLabs / Azure Neural TTS
                  • Unlimited characters
                  • Ultra-realistic voices
                  • Latency: 0.5-1 second (4x faster)

Storage:          AWS S3 / GCP Cloud Storage (Unlimited)
                  • Unlimited storage
                  • CDN integration
                  • Access: 10-50ms (5x faster)

Database:         AWS RDS / Google Cloud SQL
                  • Multi-region replication
                  • Auto-scaling
                  • High availability

Memory:           Redis Enterprise
                  • Clustering
                  • High availability
                  • Unlimited memory

WhatsApp:         Twilio Business API (Verified)
                  • Production-ready
                  • $0.005/message

Voice Calls:      Twilio Voice API
                  • Inbound/outbound calls
                  • $0.013/minute (India)

Deployment:       Kubernetes on AWS/GCP/Azure
                  • Auto-scaling
                  • Load balancing
                  • 99.9% uptime SLA

COST:             ~$500-2,000/month (depends on usage)
CAPACITY:         10,000-1,000,000+ users
PRODUCTION READY: ✅ Enterprise-grade

```

---

### 10.2 Feature Availability Matrix

| Feature | MVP (Free Tier) | Production (Premium) |
|---------|----------------|---------------------|
| **Text Chat** | ✅ Full support | ✅ Full support |
| **Voice Input** | ✅ Limited (60 min/month) | ✅ Unlimited |
| **Voice Output** | ✅ Limited (1M chars/month) | ✅ Unlimited |
| **Voice Chat Languages** | ✅ All text languages (Tamil, Hindi, Telugu, English) | ✅ All 22+ languages |
| **Native Accents** | ✅ Regional pronunciation | ✅ Custom voice models |
| **Phone Calls** | ❌ Not available | ✅ Full support |
| **WhatsApp** | ✅ Sandbox only | ✅ Business API |
| **SMS** | ❌ Not available | ✅ Full support |
| **Document OCR** | ✅ Limited (1K/month) | ✅ Unlimited |
| **Languages** | ✅ 4 languages | ✅ 22+ languages |
| **Schemes** | ✅ 4 schemes (1 per sector) | ✅ 100+ schemes |
| **Concurrent Users** | ⚠️ 10-50 | ✅ 10,000+ |
| **Response Time** | ⚠️ 500ms-2s | ✅ 100-500ms |
| **Uptime** | ⚠️ 95-98% | ✅ 99.9% |
| **Support** | ❌ Community only | ✅ 24/7 support |
| **Analytics** | ⚠️ Basic | ✅ Advanced |
| **API Access** | ❌ Not available | ✅ Full API |
| **White-label** | ❌ Not available | ✅ Available |

---

### 10.3 Cost Breakdown (Production Scale)

```
┌─────────────────────────────────────────────────────────────────────┐
│              MONTHLY COST ESTIMATE (10,000 USERS)                    │
└─────────────────────────────────────────────────────────────────────┘

LLM (GPT-4 Turbo):
  • 10,000 users × 50 requests/user = 500K requests
  • $0.01 per 1K tokens (input) × 500 tokens avg = $2.50/request
  • Total: ~$1,250/month

OCR (Google Document AI):
  • 10,000 users × 5 docs/user = 50K documents
  • $1.50 per 1,000 pages
  • Total: ~$75/month

Voice STT (Deepgram):
  • 2,000 voice users × 10 min/user = 20,000 minutes
  • $0.0125/minute
  • Total: ~$250/month

Voice TTS (ElevenLabs):
  • 2,000 voice users × 5 min/user = 10,000 minutes
  • $0.30 per 1,000 characters (avg 150 chars/min)
  • Total: ~$450/month

WhatsApp (Twilio):
  • 10,000 users × 5 messages/user = 50K messages
  • $0.005/message
  • Total: ~$250/month

Voice Calls (Twilio):
  • 1,000 call users × 5 min/user = 5,000 minutes
  • $0.013/minute
  • Total: ~$65/month

Storage (AWS S3):
  • 10,000 users × 50MB/user = 500GB
  • $0.023/GB
  • Total: ~$12/month

Database (AWS RDS):
  • db.t3.medium instance
  • Total: ~$100/month

Infrastructure (Kubernetes):
  • 3 nodes × $50/node
  • Total: ~$150/month

CDN (CloudFlare):
  • Pro plan
  • Total: ~$20/month

Monitoring (Datadog):
  • 10 hosts
  • Total: ~$150/month

───────────────────────────────────────────────────────────────────────
TOTAL MONTHLY COST:                                    ~$2,772/month
COST PER USER:                                         ~$0.28/user
COST PER APPLICATION:                                  ~$1.40/application
───────────────────────────────────────────────────────────────────────

REVENUE MODEL (Suggested):
• Free for individual users (government subsidy)
• ₹50-100/application for NGO bulk processing
• ₹500-1,000/month for enterprise API access
```

---

### 10.4 Scaling Roadmap

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: MVP                                 │
│                    Timeline: 0-3 months                              │
└─────────────────────────────────────────────────────────────────────┘
Users:              100-1,000
Stack:              100% Free Tier
Languages:          1-4 (Tamil, Hindi, Telugu, English)
Voice Support:      ✅ All text languages have voice input/output
Schemes:            4 (1 per sector)
Features:           Text + Voice (limited quota)
Deployment:         Single region
Cost:               $0/month
Goal:               Proof of concept, hackathon demo

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 2: PILOT                               │
│                    Timeline: 3-6 months                              │
└─────────────────────────────────────────────────────────────────────┘
Users:              1,000-10,000
Stack:              Hybrid (Free + Paid)
Languages:          4 (Tamil, Hindi, Telugu, English)
Voice Support:      ✅ All 4 languages with native accents
Schemes:            20 (5 per sector)
Features:           Text + Voice + WhatsApp
Deployment:         Multi-region
Cost:               $200-500/month
Goal:               User validation, feedback collection

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 3: SCALE                               │
│                    Timeline: 6-12 months                             │
└─────────────────────────────────────────────────────────────────────┘
Users:              10,000-100,000
Stack:              Premium (Paid)
Languages:          10+ languages (all major Indian languages)
Voice Support:      ✅ All languages with regional dialects
Schemes:            100+ schemes
Features:           Text + Voice + WhatsApp + Phone Calls
Deployment:         National (multi-region)
Cost:               $2,000-5,000/month
Goal:               State-level partnerships

┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 4: NATIONAL SCALE                           │
│                    Timeline: 12+ months                              │
└─────────────────────────────────────────────────────────────────────┘
Users:              100,000-1,000,000+
Stack:              Enterprise
Languages:          22 official languages + regional dialects
Voice Support:      ✅ All languages with custom voice models
Schemes:            500+ schemes (all major schemes)
Features:           All channels + API + White-label
Deployment:         National + International
Cost:               $10,000-50,000/month
Goal:               Government partnership, national rollout
```

---

## 11. Future Enhancement: Phone Call Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHONE CALL INTERACTION FLOW                       │
│                    (Post-MVP Enhancement)                            │
└─────────────────────────────────────────────────────────────────────┘

USER DIALS: 1800-XXX-XXXX (Toll-free number)
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ IVR GREETING (Language Selection)                                   │
│ ─────────────────────────────────────────────────────────────────── │
│ "Welcome to Sarvabhasha Sahayak. Press 1 for Hindi, 2 for Tamil..." │
│                                                                      │
│ OR: Automatic language detection from first spoken words            │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ AI AGENT GREETING (Natural Voice)                                   │
│ ─────────────────────────────────────────────────────────────────── │
│ Hindi: "नमस्ते, मैं आपकी सरकारी योजनाओं में मदद करूंगा।           │
│         आपको किस योजना के लिए आवेदन करना है?"                      │
│                                                                      │
│ Tamil: "வணக்கம், நான் உங்களுக்கு அரசு திட்டங்களில் உதவுவேன்.      │
│         எந்த திட்டத்திற்கு விண்ணப்பிக்க வேண்டும்?"                │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ REAL-TIME CONVERSATION                                               │
│ ─────────────────────────────────────────────────────────────────── │
│ User speaks → Deepgram STT (<500ms) → Groq LLM (200ms)             │
│            → ElevenLabs TTS (<500ms) → User hears response          │
│                                                                      │
│ Total latency: <1.5 seconds (feels natural)                         │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ SCHEME IDENTIFICATION                                                │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "आप छात्रवृत्ति के लिए पात्र हैं। क्या आपके पास ये दस्तावेज़ हैं:│
│      1. आधार कार्ड                                                  │
│      2. आय प्रमाण पत्र                                               │
│      3. मार्कशीट?"                                                   │
│                                                                      │
│ User: "हाँ, सब हैं"                                                  │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ DOCUMENT COLLECTION (Hybrid Approach)                               │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "कृपया अपने दस्तावेज़ WhatsApp पर भेजें: +91-XXXXX-XXXXX"      │
│                                                                      │
│ OR: "मैं आपको SMS भेज रहा हूं जिसमें लिंक है। उस पर क्लिक करके     │
│      दस्तावेज़ अपलोड करें।"                                          │
│                                                                      │
│ User uploads documents via WhatsApp/SMS link                        │
│ AI processes documents in background                                │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FORM FILLING (Background)                                            │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "मैं आपका फॉर्म भर रहा हूं। कृपया एक मिनट रुकें..."            │
│                                                                      │
│ [Background: Playwright fills form]                                 │
│ [Music/hold tone plays]                                             │
│                                                                      │
│ AI: "फॉर्म भर गया है। मैं आपको WhatsApp पर स्क्रीनशॉट भेज रहा हूं।  │
│      कृपया जांच लें और बताएं कि सब सही है?"                         │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ OTP VERIFICATION (During Call)                                       │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "आपके मोबाइल पर OTP आया होगा। कृपया 6 अंक बोलें।"              │
│                                                                      │
│ User: "1 2 3 4 5 6"                                                  │
│                                                                      │
│ AI: "धन्यवाद। OTP सबमिट कर रहा हूं..."                              │
│                                                                      │
│ [System submits OTP, continues automation]                          │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ FINAL SUBMISSION                                                     │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "आपका आवेदन तैयार है। क्या मैं सबमिट करूं?"                    │
│                                                                      │
│ User: "हाँ, करो"                                                     │
│                                                                      │
│ AI: "आवेदन सबमिट हो गया! आपका आवेदन संख्या: NSP2024123456         │
│      मैं आपको SMS और WhatsApp पर रसीद भेज रहा हूं।                 │
│      स्टेटस अपडेट के लिए मैं आपको सूचित करता रहूंगा।"              │
└─────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CALL COMPLETION                                                      │
│ ─────────────────────────────────────────────────────────────────── │
│ AI: "क्या मैं आपकी और कोई मदद कर सकता हूं?"                        │
│                                                                      │
│ User: "नहीं, धन्यवाद"                                                │
│                                                                      │
│ AI: "धन्यवाद! फिर मिलेंगे। नमस्ते!"                                  │
│                                                                      │
│ [Call ends]                                                          │
│ [SMS + WhatsApp confirmation sent]                                  │
└─────────────────────────────────────────────────────────────────────┘

CALL DURATION: 5-10 minutes
CALL COST: ₹1-2 per application
USER EXPERIENCE: Natural, conversational, accessible
TARGET USERS: Feature phone users, elderly, visually impaired
```

---

## 12. Summary

This document provides comprehensive workflow diagrams for the Sarvabhasha Sahayak system, covering:

1. ✅ End-to-end user journey (7 steps)
2. ✅ Document processing pipeline (8 stages)
3. ✅ Browser automation flow (Playwright)
4. ✅ Email monitoring & WhatsApp notifications
5. ✅ System architecture (all layers)
6. ✅ Data flow diagram
7. ✅ Technology stack summary
8. ✅ Performance characteristics
9. ✅ Security & privacy flow
10. ✅ MVP vs Production comparison
11. ✅ Future enhancement: Phone call support

**Key Takeaways:**
- MVP uses 100% free tier services (perfect for hackathon)
- Production stack provides 2-5x performance improvement
- Phone call support is a high-priority future enhancement
- System designed for scalability from 100 to 1M+ users
- Cost-effective at scale (~$0.28/user/month in production)
