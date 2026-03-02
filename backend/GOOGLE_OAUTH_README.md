# Google OAuth Setup - Quick Start

## 🚀 Quick Setup (Recommended)

### Windows
```bash
cd backend
scripts\quick_google_oauth_setup.bat
```

### Linux/Mac
```bash
cd backend
chmod +x scripts/quick_google_oauth_setup.sh
./scripts/quick_google_oauth_setup.sh
```

## 📋 What You Need

Before running the setup:

1. **Google OAuth Credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Create OAuth 2.0 Client ID
   - Save Client ID and Client Secret

2. **AWS Credentials**
   - Ensure AWS CLI is configured
   - Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env

## 🔧 Manual Setup

If you prefer manual setup:

```bash
cd backend
python scripts/setup_cognito.py
```

## 📝 After Setup

1. Copy the displayed environment variables to your `.env` file
2. Add the Cognito redirect URI to your Google OAuth app
3. Restart your backend server

## 🧪 Test the Integration

```bash
# Start backend
uvicorn app.main:app --reload --port 8000

# In another terminal, test the endpoint
curl -X POST http://localhost:8000/auth/google \
  -H "Content-Type: application/json" \
  -d '{"id_token": "your-google-id-token"}'
```

## 📚 Full Documentation

See [GOOGLE_OAUTH_SETUP.md](../GOOGLE_OAUTH_SETUP.md) for complete documentation.

## ❓ Troubleshooting

### "Cognito client not available"
- Check AWS credentials are configured
- Verify AWS region is correct

### "Google authentication failed"
- Verify Google Client ID and Secret
- Check redirect URIs match

### "Module not found"
- Run: `pip install -r requirements.txt`

## 🔐 Security Notes

- Never commit `.env` file to git
- Use AWS Secrets Manager in production
- Enable MFA for AWS account
- Rotate credentials regularly

## 💡 Features

✅ AWS Cognito User Pool with Google OAuth
✅ Automatic token verification
✅ Fallback to direct Google verification
✅ JWT token generation
✅ User profile management
✅ Email verification
✅ Secure credential storage

## 🎯 Next Steps

After successful setup:
1. Test login with multiple Google accounts
2. Implement user profile completion
3. Add phone number linking
4. Set up email notifications
5. Configure user pool triggers
