"""
CivicBridge - Deep AWS Integration Test
Tests actual AWS operations: DynamoDB CRUD, S3, Bedrock, Translate
"""
import json
import sys
import os
import io

# Fix Unicode output for Windows cp1252 terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import auth_service
from app.services.dynamodb_service import db
from app.services.s3_service import s3_service
from app.services.translate_service import translate_service
from app.services.bedrock_service import bedrock_service
from app.services.scheme_service import scheme_service

client = TestClient(app)
passed = 0
failed = 0
test_num = 0


def test(name, condition, detail=""):
    global passed, failed, test_num
    test_num += 1
    if condition:
        passed += 1
        print(f"  [PASS] {test_num:2d}. {name}" + (f" => {detail}" if detail else ""))
    else:
        failed += 1
        print(f"  [FAIL] {test_num:2d}. {name}" + (f" => {detail}" if detail else ""))


# ============================================================
# 1. DynamoDB Operations (Direct)
# ============================================================
print("\n=== DYNAMODB DIRECT ===")

# Create test user
test_user_id = "test_aws_user_001"
try:
    user = db.create_user({
        "user_id": test_user_id,
        "phone_number": "9999999999",
        "name": "Test User",
        "preferred_language": "en",
        "state": "Maharashtra",
        "income": 200000,
    })
    test("DynamoDB: Create user", user is not None and user["user_id"] == test_user_id, user.get("user_id", ""))
except Exception as e:
    test("DynamoDB: Create user", False, str(e)[:80])

# Get user
try:
    user = db.get_user(test_user_id)
    test("DynamoDB: Get user", user is not None and user["name"] == "Test User", user.get("name", ""))
except Exception as e:
    test("DynamoDB: Get user", False, str(e)[:80])

# Get user by phone
try:
    user = db.get_user_by_phone("9999999999")
    test("DynamoDB: Get user by phone (GSI)", user is not None, f"user_id={user.get('user_id','')}" if user else "None")
except Exception as e:
    test("DynamoDB: Get user by phone (GSI)", False, str(e)[:80])

# Update user
try:
    updated = db.update_user(test_user_id, {"age": 28, "income": 250000})
    test("DynamoDB: Update user", updated is not None and updated.get("age") == 28, f"age={updated.get('age')}")
except Exception as e:
    test("DynamoDB: Update user", False, str(e)[:80])

# Schemes from DynamoDB  
try:
    schemes = db.get_all_schemes()
    test("DynamoDB: Get all schemes", len(schemes) >= 20, f"{len(schemes)} schemes")
except Exception as e:
    test("DynamoDB: Get all schemes", False, str(e)[:80])

# Scheme by category (GSI query)
try:
    edu = db.get_schemes_by_category("education")
    test("DynamoDB: Schemes by category (GSI)", len(edu) > 0, f"{len(edu)} education schemes")
except Exception as e:
    test("DynamoDB: Schemes by category (GSI)", False, str(e)[:80])

# Get specific scheme
try:
    scheme = db.get_scheme("EDU001")
    test("DynamoDB: Get scheme by ID", scheme is not None, scheme.get("name", "")[:40] if scheme else "None")
except Exception as e:
    test("DynamoDB: Get scheme by ID", False, str(e)[:80])

# Save and get conversation
try:
    conv = db.save_conversation({
        "user_id": test_user_id,
        "conversation_id": "test_conv_001",
        "messages": [{"role": "user", "content": "Hello", "timestamp": "2026-02-28T00:00:00Z"}],
        "language": "en",
    })
    test("DynamoDB: Save conversation", conv is not None, conv.get("conversation_id", ""))
except Exception as e:
    test("DynamoDB: Save conversation", False, str(e)[:80])

try:
    conv = db.get_conversation(test_user_id, "test_conv_001")
    test("DynamoDB: Get conversation", conv is not None and conv.get("conversation_id") == "test_conv_001")
except Exception as e:
    test("DynamoDB: Get conversation", False, str(e)[:80])

try:
    convs = db.get_user_conversations(test_user_id)
    test("DynamoDB: List user conversations", len(convs) > 0, f"{len(convs)} conversations")
except Exception as e:
    test("DynamoDB: List user conversations", False, str(e)[:80])

# OTP flow via DynamoDB
try:
    db.save_otp("9999999999", "123456")
    verified = db.verify_otp("9999999999", "123456")
    test("DynamoDB: OTP save & verify", verified, "OTP verified successfully")
except Exception as e:
    test("DynamoDB: OTP save & verify", False, str(e)[:80])

# ============================================================
# 2. S3 Operations
# ============================================================
print("\n=== S3 ===")

try:
    key = s3_service.upload_file(b"Hello CivicBridge!", "test/hello.txt", "text/plain")
    test("S3: Upload file", key == "test/hello.txt", f"key={key}")
except Exception as e:
    test("S3: Upload file", False, str(e)[:80])

try:
    exists = s3_service.file_exists("test/hello.txt")
    test("S3: File exists", exists)
except Exception as e:
    test("S3: File exists", False, str(e)[:80])

try:
    content = s3_service.download_file("test/hello.txt")
    test("S3: Download file", content == b"Hello CivicBridge!", f"got {len(content)} bytes")
except Exception as e:
    test("S3: Download file", False, str(e)[:80])

try:
    url = s3_service.get_presigned_url("test/hello.txt", expiration=60)
    test("S3: Presigned URL", url and "civicbridge-documents" in url, url[:60] + "...")
except Exception as e:
    test("S3: Presigned URL", False, str(e)[:80])

try:
    deleted = s3_service.delete_file("test/hello.txt")
    test("S3: Delete file", deleted)
except Exception as e:
    test("S3: Delete file", False, str(e)[:80])

# ============================================================
# 3. Translate
# ============================================================
print("\n=== TRANSLATE ===")

try:
    result = translate_service.translate("Hello, how are you?", "en", "hi")
    has_translation = len(result.get("translated_text", "")) > 0
    is_fallback = result.get("is_fallback", True)
    test("Translate: EN->HI", has_translation, 
         f"'{result.get('translated_text','')[:50]}' (fallback={is_fallback})")
except Exception as e:
    test("Translate: EN->HI", False, str(e)[:80])

try:
    langs = translate_service.get_supported_languages()
    test("Translate: List languages", len(langs) > 20, f"{len(langs)} languages")
except Exception as e:
    test("Translate: List languages", False, str(e)[:80])

# ============================================================
# 5. Bedrock (AI Chat)
# ============================================================
print("\n=== BEDROCK (AI) ===")

try:
    result = bedrock_service.chat(
        user_message="I am a farmer from Maharashtra with 2 acres of land. What schemes can I apply for?",
        user_profile={"name": "Test User", "state": "Maharashtra", "occupation": "farmer"},
        language="en"
    )
    has_message = isinstance(result, dict) and len(result.get("message", "")) > 10
    test("Bedrock: AI chat (scheme query)", has_message,
         f"'{result.get('message','')[:60]}...'" if has_message else str(result)[:60])
except Exception as e:
    test("Bedrock: AI chat (scheme query)", False, str(e)[:80])

# ============================================================
# 6. Scheme Service (Business Logic)
# ============================================================
print("\n=== SCHEME SERVICE ===")

try:
    schemes = scheme_service.get_all_schemes()
    test("SchemeService: Get all", len(schemes) >= 26, f"{len(schemes)} schemes")
except Exception as e:
    test("SchemeService: Get all", False, str(e)[:80])

try:
    results = scheme_service.search_schemes(query="education")
    test("SchemeService: Search", len(results) > 0, f"{len(results)} results for 'education'")
except Exception as e:
    test("SchemeService: Search", False, str(e)[:80])

try:
    matches = scheme_service.match_schemes({
        "age": 20,
        "income": 200000,
        "state": "Maharashtra",
        "category": "SC",
        "education_level": "12th_pass",
        "occupation": "student"
    })
    test("SchemeService: Match for student", len(matches) > 0, f"{len(matches)} matching schemes")
except Exception as e:
    test("SchemeService: Match for student", False, str(e)[:80])

# ============================================================
# 7. Full Auth Flow via API
# ============================================================
print("\n=== FULL AUTH FLOW (API) ===")

# Send OTP
resp = client.post("/api/v1/auth/send-otp", json={"phone_number": "8888888888"})
test("Auth API: Send OTP", resp.status_code == 200)

# Get the OTP from DynamoDB
try:
    otp_item = db.users_table.get_item(Key={"user_id": "otp_8888888888"}).get("Item", {})
    otp = otp_item.get("otp_code", "")
except Exception:
    otp = ""
test("Auth API: OTP stored in DynamoDB", len(otp) == 6, f"OTP={otp}")

# Register with OTP
resp = client.post("/api/v1/auth/register", json={
    "phone_number": "8888888888",
    "otp": otp,
    "name": "AWS Test User",
    "preferred_language": "hi",
    "state": "Rajasthan",
})
if resp.status_code == 200:
    token = resp.json().get("access_token", "") or resp.json().get("token", "")
    test("Auth API: Register", len(token) > 0, f"token={token[:20]}...")
else:
    test("Auth API: Register", False, f"status={resp.status_code} body={resp.text[:100]}")
    token = ""

# Use token for authenticated requests
if token:
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get profile
    resp = client.get("/api/v1/users/me", headers=headers)
    test("Auth API: Get profile", resp.status_code == 200 and resp.json().get("name") == "AWS Test User",
         resp.json().get("name", ""))
    
    # Chat with AI
    resp = client.post("/api/v1/chat/message", headers=headers, json={
        "message": "What government schemes are available for farmers?",
        "language": "en"
    })
    test("Auth API: Chat with AI", resp.status_code == 200 and len(resp.json().get("message", "")) > 10,
         resp.json().get("message", "")[:60] + "...")
    
    # Get schemes
    resp = client.get("/api/v1/schemes/", headers=headers)
    schemes_data = resp.json()
    test("Auth API: Get schemes", resp.status_code == 200 and schemes_data.get("total", 0) >= 20,
         f"{schemes_data.get('total', 0)} schemes")
    
    # Dashboard
    resp = client.get("/api/v1/users/me/dashboard", headers=headers)
    test("Auth API: Dashboard", resp.status_code == 200, f"keys={list(resp.json().keys())[:5]}")

# ============================================================
# 8. Cleanup
# ============================================================
print("\n=== CLEANUP ===")

try:
    db.delete_conversation(test_user_id, "test_conv_001")
    db.delete_user(test_user_id)
    test("Cleanup: Deleted test data", True)
except Exception as e:
    test("Cleanup: Deleted test data", False, str(e)[:80])

# ============================================================
print(f"\n{'='*50}")
print(f"TOTAL: {test_num} | PASSED: {passed} | FAILED: {failed}")
print(f"{'='*50}")
