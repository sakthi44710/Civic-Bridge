# Quick Start: Google OAuth Setup

## ✅ Dependencies Installed

All required Python packages are already installed in your virtual environment:
- ✅ google-auth
- ✅ google-auth-oauthlib  
- ✅ python-jose[cryptography]
- ✅ twilio

## 🚀 Next Steps

### Step 1: Get Google OAuth Credentials (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

2. Create a new project or select existing one

3. Click **"Create Credentials"** → **"OAuth 2.0 Client ID"**

4. If prompted, configure OAuth consent screen:
   - User Type: **External**
   - App name: **CivicBridge**
   - User support email: your-email@example.com
   - Developer contact: your-email@example.com
   - Click **Save and Continue** through all steps

5. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: **CivicBridge Web**
   - Authorized JavaScript origins:
     - `http://localhost:5173`
   - Authorized redirect URIs:
     - `http://localhost:5173/auth/callback`
   - Click **Create**

6. **SAVE THESE VALUES:**
   - Client ID (looks like: `xxxxx.apps.googleusercontent.com`)
   - Client Secret (looks like: `GOCSPX-xxxxx`)

### Step 2: Run Automated Setup

Open a new terminal in the backend directory and run:

```bash
cd backend
python scripts/setup_cognito.py
```

The script will:
- ✅ Create AWS Cognito User Pool
- ✅ Create User Pool Client
- ✅ Configure Google as Identity Provider
- ✅ Set up User Pool Domain
- ✅ Display configuration to add to .env

**You'll be asked to enter:**
1. Your Google Client ID
2. Your Google Client Secret
3. A domain prefix (e.g., `civicbridge-auth`)

### Step 3: Update .env File

After the script completes, it will display environment variables. Copy them to your `backend/.env` file:

```env
# AWS Cognito (Google OAuth)
COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX
COGNITO_CLIENT_ID=your-cognito-client-id
COGNITO_CLIENT_SECRET=your-cognito-client-secret
COGNITO_DOMAIN=civicbridge-auth
COGNITO_REGION=ap-south-1

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
```

### Step 4: Update Google Console (Important!)

Go back to [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Click on your OAuth 2.0 Client ID
2. Add this to **Authorized redirect URIs**:
   ```
   https://civicbridge-auth.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse
   ```
   (Replace `civicbridge-auth` with your domain prefix)
3. Click **Save**

### Step 5: Restart Backend

Stop your current backend server (Ctrl+C) and restart:

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 6: Test Google OAuth

1. Open your frontend: http://localhost:5173
2. Click **"Continue with Google"** button
3. Sign in with your Google account
4. You should be logged in successfully!

## 🧪 Manual Testing

Test the API endpoint directly:

```bash
curl -X POST http://localhost:8000/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "id_token": "your-google-id-token",
    "preferred_language": "en"
  }'
```

## ⚠️ Troubleshooting

### "AWS credentials not configured"
```bash
# Set AWS credentials in .env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-south-1
```

### "Google authentication failed"
- Verify Google Client ID and Secret in .env
- Check that redirect URIs match in Google Console
- Ensure token hasn't expired

### "Cognito User Pool creation failed"
- Check AWS IAM permissions
- Verify AWS region is correct
- Check AWS service quotas

## 📊 What Happens Behind the Scenes

```
User clicks "Continue with Google"
    ↓
Google OAuth popup opens
    ↓
User signs in with Google
    ↓
Google returns ID token
    ↓
Frontend sends token to backend
    ↓
Backend verifies token with AWS Cognito
    ↓
User created/logged in DynamoDB
    ↓
JWT token returned to frontend
    ↓
User is authenticated!
```

## 🎯 Success Indicators

✅ Setup script completes without errors
✅ Environment variables added to .env
✅ Backend starts without errors
✅ Google OAuth button works in frontend
✅ User can sign in with Google account
✅ User data appears in DynamoDB

## 📚 Additional Resources

- **Complete Guide**: See `GOOGLE_OAUTH_SETUP.md`
- **Setup Summary**: See `SETUP_SUMMARY.md`
- **AWS Cognito Docs**: https://docs.aws.amazon.com/cognito/
- **Google OAuth Docs**: https://developers.google.com/identity/protocols/oauth2

## 💡 Tips

1. **Development**: Use `http://localhost:5173` for testing
2. **Production**: Update redirect URIs with your production domain
3. **Security**: Never commit .env file to git
4. **Monitoring**: Check AWS CloudWatch for Cognito logs
5. **Cost**: First 50,000 users/month are FREE with AWS Cognito

## 🎉 You're Ready!

Once setup is complete, your users can:
- ✅ Sign in with Google (one click)
- ✅ No password needed
- ✅ Automatic profile creation
- ✅ Secure authentication
- ✅ Fast login experience

**Need help?** Check the troubleshooting section or review the complete documentation.
