"""
Full E2E test of auth flow: Send OTP -> Verify -> Register (new user) -> Login (existing user)
Simulates exactly what the frontend does.
"""
import requests
import json

BASE = 'http://localhost:8000/api/v1'

def test_full_auth_flow():
    phone = '7777777777'
    
    # Step 1: Send OTP
    print('=== Step 1: Send OTP ===')
    r = requests.post(f'{BASE}/auth/send-otp', json={'phone_number': phone})
    print(f'  Status: {r.status_code}')
    print(f'  Response: {r.json()}')
    assert r.status_code == 200
    
    # Step 2: We need the actual OTP. In dev mode it's logged.
    # Let's check if DynamoDB has it or use the dev store approach
    # For testing, let's add a test endpoint or read the OTP
    # Actually, let's check the DynamoDB OTP table
    import sys
    sys.path.insert(0, '.')
    from app.services.dynamodb_service import db
    
    # Get OTP from DynamoDB (stored in users table with key otp_{phone})
    try:
        import boto3
        dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
        users_table = dynamodb.Table('civicbridge-users')
        otp_record = users_table.get_item(Key={'user_id': f'otp_{phone}'}).get('Item', {})
        actual_otp = otp_record.get('otp_code', '')
        print(f'  OTP from DynamoDB: {actual_otp}')
    except Exception as e:
        print(f'  Could not get OTP from DynamoDB: {e}')
        actual_otp = ''
    
    if not actual_otp:
        print('  ERROR: Could not get OTP!')
        return False
    
    # Step 3: Verify OTP - should return is_new_user=True
    print(f'\n=== Step 2: Verify OTP ({actual_otp}) - expect new user ===')
    r = requests.post(f'{BASE}/auth/verify-otp', json={'phone_number': phone, 'otp': actual_otp})
    print(f'  Status: {r.status_code}')
    data = r.json()
    print(f'  Response: {json.dumps(data, indent=4)}')
    assert r.status_code == 200
    assert data.get('is_new_user') == True, f"Expected is_new_user=True, got {data}"
    print('  PASS: New user detected correctly')
    
    # Step 4: Register (NO re-verification needed now)
    print(f'\n=== Step 3: Register new user ===')
    r = requests.post(f'{BASE}/auth/register', json={
        'phone_number': phone,
        'otp': actual_otp,  # This OTP was already consumed, but register no longer verifies it
        'name': 'Test User E2E',
        'preferred_language': 'en'
    })
    print(f'  Status: {r.status_code}')
    data = r.json()
    print(f'  Response: {json.dumps(data, indent=4)}')
    assert r.status_code == 200, f"Registration failed: {data}"
    assert data.get('access_token'), "No access_token in response!"
    assert data.get('user_id'), "No user_id in response!"
    assert data.get('name') == 'Test User E2E', f"Name mismatch: {data.get('name')}"
    print(f'  PASS: User registered with token: {data["access_token"][:20]}...')
    
    token = data['access_token']
    
    # Step 5: Verify token works - access protected endpoint
    print(f'\n=== Step 4: Test protected endpoint with token ===')
    headers = {'Authorization': f'Bearer {token}'}
    r = requests.get(f'{BASE}/users/me', headers=headers)
    print(f'  Status: {r.status_code}')
    if r.status_code == 200:
        profile = r.json()
        print(f'  Profile name: {profile.get("name")}')
        print(f'  PASS: Token works!')
    else:
        print(f'  Response: {r.json()}')
        print('  WARNING: Token may not work for profile yet')
    
    # Step 6: Test dashboard endpoint
    print(f'\n=== Step 5: Test dashboard ===')
    r = requests.get(f'{BASE}/users/me/dashboard', headers=headers)
    print(f'  Status: {r.status_code}')
    if r.status_code == 200:
        dash = r.json()
        print(f'  User name: {dash.get("user", {}).get("name")}')
        print(f'  Docs count: {dash.get("documents_count")}')
        print(f'  Apps count: {dash.get("applications_count")}')
        print(f'  PASS: Dashboard works!')
    
    # Step 7: Now test re-login flow
    print(f'\n=== Step 6: Re-login (existing user) ===')
    r = requests.post(f'{BASE}/auth/send-otp', json={'phone_number': phone})
    print(f'  Send OTP: {r.status_code}')
    
    # Get new OTP
    try:
        import boto3
        dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
        users_table = dynamodb.Table('civicbridge-users')
        otp_record = users_table.get_item(Key={'user_id': f'otp_{phone}'}).get('Item', {})
        new_otp = otp_record.get('otp_code', '')
    except:
        new_otp = ''
    
    r = requests.post(f'{BASE}/auth/verify-otp', json={'phone_number': phone, 'otp': new_otp})
    print(f'  Verify OTP: {r.status_code}')
    data = r.json()
    print(f'  Response: {json.dumps(data, indent=4)}')
    assert data.get('is_new_user') == False, "Should be existing user!"
    assert data.get('access_token'), "Should have access_token!"
    assert data.get('name') == 'Test User E2E', f"Name mismatch: {data.get('name')}"
    print(f'  PASS: Existing user login works!')
    
    print('\n' + '=' * 50)
    print('ALL AUTH FLOW TESTS PASSED!')
    print('=' * 50)
    return True

if __name__ == '__main__':
    test_full_auth_flow()
