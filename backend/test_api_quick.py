"""Quick test of backend API response formats"""
import requests
import json

BASE = 'http://localhost:8000/api/v1'

# Test 1: Send OTP
print('=== Test 1: Send OTP ===')
try:
    r = requests.post(f'{BASE}/auth/send-otp', json={'phone_number': '9999999999'})
    print(f'Status: {r.status_code}')
    print(f'Response: {json.dumps(r.json(), indent=2)}')
except Exception as e:
    print(f'Error: {e}')

# Test 2: Verify OTP (wrong OTP shows 401 format)
print('\n=== Test 2: Verify OTP (wrong OTP) ===')
try:
    r = requests.post(f'{BASE}/auth/verify-otp', json={'phone_number': '9999999999', 'otp': '000000'})
    print(f'Status: {r.status_code}')
    print(f'Response: {json.dumps(r.json(), indent=2)}')
except Exception as e:
    print(f'Error: {e}')

# Test 3: Schemes list
print('\n=== Test 3: Schemes List ===')
try:
    r = requests.get(f'{BASE}/schemes/')
    data = r.json()
    print(f'Status: {r.status_code}')
    total = data.get('total', 0)
    print(f'Total schemes: {total}')
    schemes = data.get('schemes', [])
    if schemes:
        print(f'First scheme: {schemes[0].get("name", "")}')
except Exception as e:
    print(f'Error: {e}')

# Test 4: Health check
print('\n=== Test 4: Health Check ===')
try:
    r = requests.get('http://localhost:8000/health')
    print(f'Status: {r.status_code}')
    print(f'Response: {json.dumps(r.json(), indent=2)}')
except Exception as e:
    print(f'Error: {e}')

print('\nAll API tests done!')
