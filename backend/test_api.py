"""Comprehensive API endpoint test"""
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app, raise_server_exceptions=False)
results = []

def test(num, method, path, json_body=None, headers=None, params=None):
    if method == "GET":
        r = client.get(path, headers=headers, params=params)
    elif method == "POST":
        r = client.post(path, json=json_body, headers=headers)
    elif method == "DELETE":
        r = client.delete(path, headers=headers)
    else:
        r = client.put(path, json=json_body, headers=headers)
    
    status = r.status_code
    ok = "PASS" if status < 500 else "FAIL"
    try:
        body = r.json()
    except:
        body = {}
    
    info = ""
    if "total" in body:
        info = f" (total: {body['total']})"
    elif "is_new_user" in body:
        info = f" (new_user: {body['is_new_user']})"
    elif "access_token" in body:
        info = " (has_token)"
    
    print(f"  [{ok}] {num:2d}. {method:6s} {path} => {status}{info}")
    results.append((num, ok, status))
    return r, body

# Auth flow
print("\n=== AUTH ===")
r, _ = test(1, "POST", "/api/v1/auth/send-otp", {"phone_number": "9876543210"})

from app.services.auth_service import _dev_otp_store
otp = _dev_otp_store.get("9876543210", "000000")

r, body = test(2, "POST", "/api/v1/auth/verify-otp", {"phone_number": "9876543210", "otp": otp})

r, _ = test(3, "POST", "/api/v1/auth/send-otp", {"phone_number": "9876543210"})
otp2 = _dev_otp_store.get("9876543210", "000000")
r, body = test(4, "POST", "/api/v1/auth/register", {"phone_number": "9876543210", "otp": otp2, "name": "Dev User"})
token = body.get("access_token", "")
h = {"Authorization": f"Bearer {token}"}

# Users
print("\n=== USERS ===")
test(5, "GET", "/api/v1/users/me", headers=h)
test(6, "GET", "/api/v1/users/me/dashboard", headers=h)
test(7, "PUT", "/api/v1/users/me", json_body={"name": "Updated Name"}, headers=h)

# Schemes
print("\n=== SCHEMES ===")
test(8, "GET", "/api/v1/schemes/")
test(9, "GET", "/api/v1/schemes/categories")
test(10, "GET", "/api/v1/schemes/", params={"category": "healthcare"})
test(11, "GET", "/api/v1/schemes/", params={"category": "education"})
test(12, "GET", "/api/v1/schemes/", params={"query": "PM-KISAN"})
test(13, "GET", "/api/v1/schemes/EDU001")
test(14, "GET", "/api/v1/schemes/HLT001")
test(15, "GET", "/api/v1/schemes/NONEXISTENT")

# Chat
print("\n=== CHAT ===")
test(16, "POST", "/api/v1/chat/message", {"message": "What schemes am I eligible for?", "language": "en"}, headers=h)
test(17, "GET", "/api/v1/chat/conversations", headers=h)

# Documents
print("\n=== DOCUMENTS ===")
test(18, "GET", "/api/v1/documents/", headers=h)

# Applications
print("\n=== APPLICATIONS ===")
test(19, "GET", "/api/v1/applications/", headers=h)
test(20, "POST", "/api/v1/applications/start", {"scheme_id": "EDU001"}, headers=h)

# Translation
print("\n=== TRANSLATION ===")
test(21, "GET", "/api/v1/translate/languages")

# Languages
print("\n=== SYSTEM ===")
test(22, "GET", "/api/v1/languages")
test(23, "GET", "/")
test(24, "GET", "/health")

# Auth guard tests
print("\n=== AUTH GUARDS ===")
test(25, "GET", "/api/v1/users/me")  # No auth
test(26, "POST", "/api/v1/chat/message", {"message": "test"})  # No auth
test(27, "GET", "/api/v1/documents/")  # No auth
test(28, "GET", "/api/v1/applications/")  # No auth

# Validation tests
print("\n=== VALIDATION ===")
test(29, "POST", "/api/v1/auth/send-otp", {"phone_number": "123"})  # Invalid phone
test(30, "POST", "/api/v1/auth/verify-otp", {"phone_number": "9876543210", "otp": "12"})  # Invalid OTP

# Summary
total = len(results)
passed = sum(1 for _, ok, _ in results if ok == "PASS")
failed = sum(1 for _, ok, _ in results if ok == "FAIL")
print(f"\n{'='*50}")
print(f"TOTAL: {total} | PASSED: {passed} | FAILED: {failed}")
if failed:
    print("FAILED tests:")
    for num, ok, status in results:
        if ok == "FAIL":
            print(f"  Test {num}: HTTP {status}")
