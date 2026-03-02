"""
CivicBridge - Full Backend Health Check
Tests every service and reports READY / NOT READY status
"""
import sys, os, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import boto3
from app.config import settings

print("=" * 60)
print("  CIVICBRIDGE - BACKEND HEALTH CHECK")
print("=" * 60)
print(f"\n  Region:     {settings.AWS_REGION}")
print(f"  Access Key: {settings.AWS_ACCESS_KEY_ID[:8]}...{settings.AWS_ACCESS_KEY_ID[-4:]}")
print(f"  Chat Model: {settings.BEDROCK_MODEL_ID}")
print(f"  Smart Model:{settings.BEDROCK_SMART_MODEL}")

results = {}

# ============================================================
# 1. DynamoDB
# ============================================================
print(f"\n{'='*60}")
print("1. DYNAMODB")
try:
    session = boto3.Session(
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY
    )
    ddb = session.client("dynamodb")
    tables = ddb.list_tables()["TableNames"]
    civic_tables = [t for t in tables if "civicbridge" in t.lower()]
    print(f"   All tables:       {tables}")
    print(f"   CivicBridge ones: {civic_tables}")
    
    expected = [settings.USERS_TABLE, settings.DOCUMENTS_TABLE, 
                settings.APPLICATIONS_TABLE, settings.SCHEMES_TABLE, 
                settings.CONVERSATIONS_TABLE]
    missing = [t for t in expected if t not in tables]
    
    if missing:
        print(f"   MISSING TABLES:   {missing}")
        results["DynamoDB"] = f"PARTIAL - missing {len(missing)} tables: {missing}"
    else:
        # Check if schemes are seeded
        resource = session.resource("dynamodb")
        schemes_table = resource.Table(settings.SCHEMES_TABLE)
        count = schemes_table.scan(Select="COUNT")["Count"]
        print(f"   Schemes seeded:   {count}")
        results["DynamoDB"] = f"READY ({len(civic_tables)} tables, {count} schemes)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["DynamoDB"] = f"FAIL - {e}"

# ============================================================
# 2. S3
# ============================================================
print(f"\n{'='*60}")
print("2. S3")
try:
    s3 = session.client("s3")
    buckets = [b["Name"] for b in s3.list_buckets()["Buckets"] if "civicbridge" in b["Name"]]
    print(f"   Buckets: {buckets}")
    
    expected_buckets = [settings.DOCUMENTS_BUCKET, settings.SCREENSHOTS_BUCKET]
    missing_b = [b for b in expected_buckets if b not in buckets]
    if missing_b:
        print(f"   MISSING: {missing_b}")
        results["S3"] = f"PARTIAL - missing {missing_b}"
    else:
        results["S3"] = f"READY ({len(buckets)} buckets)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["S3"] = f"FAIL - {e}"

# ============================================================
# 3. Polly (TTS)
# ============================================================
print(f"\n{'='*60}")
print("3. POLLY (Text-to-Speech)")
try:
    polly = session.client("polly")
    resp = polly.synthesize_speech(Text="Test", OutputFormat="mp3", VoiceId="Aditi", LanguageCode="hi-IN")
    audio_len = len(resp["AudioStream"].read())
    print(f"   Hindi TTS: {audio_len} bytes")
    results["Polly"] = f"READY ({audio_len} bytes test)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Polly"] = f"FAIL - {e}"

# ============================================================
# 4. Bedrock (AI)
# ============================================================
print(f"\n{'='*60}")
print("4. BEDROCK (AI Chat)")
try:
    br = session.client("bedrock-runtime")
    
    # Test chat model
    resp = br.converse(
        modelId=settings.BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": "Say OK only."}]}],
        inferenceConfig={"maxTokens": 20, "temperature": 0}
    )
    chat_text = resp["output"]["message"]["content"][0]["text"].strip()
    print(f"   Chat model ({settings.BEDROCK_MODEL_ID}): {chat_text[:30]}")
    
    # Test smart model
    resp = br.converse(
        modelId=settings.BEDROCK_SMART_MODEL,
        messages=[{"role": "user", "content": [{"text": "Say OK only."}]}],
        inferenceConfig={"maxTokens": 20, "temperature": 0}
    )
    smart_text = resp["output"]["message"]["content"][0]["text"].strip()
    print(f"   Smart model ({settings.BEDROCK_SMART_MODEL}): {smart_text[:30]}")
    
    results["Bedrock"] = "READY (both models responding)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Bedrock"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# 5. Translate
# ============================================================
print(f"\n{'='*60}")
print("5. TRANSLATE")
try:
    tr = session.client("translate")
    resp = tr.translate_text(Text="Hello", SourceLanguageCode="en", TargetLanguageCode="hi")
    print(f"   EN->HI: Hello => {resp['TranslatedText']}")
    results["Translate"] = f"READY"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Translate"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# 6. Comprehend
# ============================================================
print(f"\n{'='*60}")
print("6. COMPREHEND (Entity Extraction)")
try:
    comp = session.client("comprehend")
    resp = comp.detect_entities(Text="Rahul Kumar lives in Mumbai", LanguageCode="en")
    entities = [(e["Type"], e["Text"]) for e in resp["Entities"]]
    print(f"   Entities: {entities}")
    results["Comprehend"] = f"READY ({len(entities)} entities detected)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Comprehend"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# 7. Textract (OCR)
# ============================================================
print(f"\n{'='*60}")
print("7. TEXTRACT (Document OCR)")
try:
    tx = session.client("textract")
    # Create a minimal valid test - just check API responds
    # We'll use list_adapter API which doesn't need a document
    # Actually, let's just try detect with a tiny image
    import struct, zlib
    width, height = 10, 10
    raw = b""
    for y in range(height):
        raw += b"\x00" + b"\xff\xff\xff" * width
    compressed = zlib.compress(raw)
    def chunk(ctype, data):
        c = ctype + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xffffffff)
        return struct.pack(">I", len(data)) + c + crc
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    
    try:
        resp = tx.detect_document_text(Document={"Bytes": png})
        print(f"   API responding: {len(resp.get('Blocks', []))} blocks")
        results["Textract"] = "READY"
    except tx.exceptions.UnsupportedDocumentException:
        print(f"   API responding (blank image rejected - expected)")
        results["Textract"] = "READY (API verified)"
    except Exception as e2:
        if "UnsupportedDocument" in str(e2) or "InvalidDocument" in str(e2):
            print(f"   API responding (test image - expected)")
            results["Textract"] = "READY (API verified)"
        else:
            raise
except Exception as e:
    print(f"   ERROR: {e}")
    results["Textract"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# 8. Transcribe (Speech-to-Text)
# ============================================================
print(f"\n{'='*60}")
print("8. TRANSCRIBE (Speech-to-Text)")
try:
    ts = session.client("transcribe")
    resp = ts.list_transcription_jobs(MaxResults=1)
    print(f"   API responding: {len(resp.get('TranscriptionJobSummaries', []))} jobs")
    results["Transcribe"] = "READY"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Transcribe"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# 9. OTP / Auth
# ============================================================
print(f"\n{'='*60}")
print("9. OTP / AUTH SERVICE")
twilio_sid = settings.TWILIO_ACCOUNT_SID if hasattr(settings, 'TWILIO_ACCOUNT_SID') else ""
twilio_token = settings.TWILIO_AUTH_TOKEN if hasattr(settings, 'TWILIO_AUTH_TOKEN') else ""
if twilio_sid and twilio_token:
    print(f"   Twilio SID: {twilio_sid[:8]}...")
    results["OTP/SMS"] = "CONFIGURED (Twilio)"
else:
    print(f"   Twilio: NOT CONFIGURED (SID and Token are empty)")
    print(f"   OTP is stored in DynamoDB but NOT sent via SMS")
    print(f"   For testing: OTP can be read from DynamoDB")
    results["OTP/SMS"] = "DEV MODE (OTP saved to DB, no SMS sent)"

# ============================================================
# 10. Playwright (Browser Automation)
# ============================================================
print(f"\n{'='*60}")
print("10. PLAYWRIGHT (Browser Automation)")
try:
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_content("<h1>Test</h1>")
    ss = page.screenshot()
    browser.close()
    pw.stop()
    print(f"   Chromium: OK ({len(ss)} bytes screenshot)")
    results["Playwright"] = "READY (Chromium headless)"
except Exception as e:
    print(f"   ERROR: {e}")
    results["Playwright"] = f"FAIL - {str(e)[:80]}"

# ============================================================
# SUMMARY
# ============================================================
print(f"\n{'='*60}")
print("  HEALTH CHECK SUMMARY")
print(f"{'='*60}")

ready_count = 0
total = len(results)
for service, status in results.items():
    icon = "OK" if "READY" in status else ("WARN" if "PARTIAL" in status or "DEV" in status else "FAIL")
    if "READY" in status:
        ready_count += 1
    elif "DEV MODE" in status:
        ready_count += 1  # Acceptable for dev
    print(f"  [{icon:4}] {service:<15} {status}")

print(f"\n  Services Ready: {ready_count}/{total}")
print(f"{'='*60}")
