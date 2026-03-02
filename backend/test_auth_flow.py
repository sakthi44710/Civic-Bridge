"""Full end-to-end auth flow test - send OTP, verify, register"""
import requests
import json
import re

BASE = 'http://localhost:8000/api/v1'

# Step 1: Send OTP
print('=== Step 1: Send OTP ===')
r = requests.post(f'{BASE}/auth/send-otp', json={'phone_number': '8888888888'})
print(f'Status: {r.status_code}')
print(f'Response: {json.dumps(r.json(), indent=2)}')

# Step 2: We need to get the OTP from the dev mode logs
# In dev mode, OTP is stored in memory. Let's try common dev OTPs or check
# Let's verify with dummy OTP first to see what happens
print('\n=== Step 2: Verify OTP (testing with 123456) ===')
# Try the standard dev OTP patterns  
for test_otp in ['123456']:
    r = requests.post(f'{BASE}/auth/verify-otp', json={'phone_number': '8888888888', 'otp': test_otp})
    print(f'OTP {test_otp}: Status={r.status_code}, Response={json.dumps(r.json(), indent=2)}')
    if r.status_code == 200:
        data = r.json()
        print(f'\nParsed response:')
        print(f'  is_new_user: {data.get("is_new_user")}')
        print(f'  access_token: {data.get("access_token", "N/A")[:20]}...' if data.get("access_token") else '  access_token: None')
        print(f'  user_id: {data.get("user_id", "N/A")}')
        print(f'  name: {data.get("name", "N/A")}')
        
        if data.get('is_new_user'):
            print('\n=== Step 3: Register new user ===')
            # Need fresh OTP for register
            r2 = requests.post(f'{BASE}/auth/send-otp', json={'phone_number': '8888888888'})
            print(f'Re-sent OTP: Status={r2.status_code}')
            
            # We can't easily get the new OTP in this test, so let's test register endpoint
            r3 = requests.post(f'{BASE}/auth/register', json={
                'phone_number': '8888888888',
                'otp': test_otp,  # This will fail since OTP was consumed
                'name': 'Test User',
                'preferred_language': 'en'
            })
            print(f'Register: Status={r3.status_code}')
            print(f'Register Response: {json.dumps(r3.json(), indent=2)}')
        break

print('\n=== Full auth flow test complete ===')
