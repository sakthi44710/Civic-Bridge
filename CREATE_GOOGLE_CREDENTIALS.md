# Create Google OAuth Credentials - Step by Step

## 📋 Step-by-Step Guide

### Step 1: Access Google Cloud Console

1. Open your browser and go to: **https://console.cloud.google.com/**
2. Sign in with your Google account

### Step 2: Create or Select a Project

**Option A: Create New Project**
1. Click the project dropdown at the top
2. Click **"New Project"**
3. Enter project name: **CivicBridge**
4. Click **"Create"**
5. Wait for project creation (takes ~30 seconds)
6. Select your new project from the dropdown

**Option B: Use Existing Project**
1. Click the project dropdown at the top
2. Select your existing project

### Step 3: Enable Required APIs

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"** and click it
3. Click **"Enable"** button
4. Go back and search for **"People API"**
5. Click **"Enable"** button

### Step 4: Configure OAuth Consent Screen

1. In the left sidebar, click **"APIs & Services"** → **"OAuth consent screen"**

2. Choose User Type:
   - Select **"External"**
   - Click **"Create"**

3. Fill in App Information:
   ```
   App name: CivicBridge
   User support email: [your-email@example.com]
   App logo: [Optional - skip for now]
   ```

4. App Domain (Optional - can skip):
   ```
   Application home page: http://localhost:5173
   Application privacy policy: [skip for now]
   Application terms of service: [skip for now]
   ```

5. Developer Contact Information:
   ```
   Email addresses: [your-email@example.com]
   ```

6. Click **"Save and Continue"**

7. Scopes Page:
   - Click **"Add or Remove Scopes"**
   - Select these scopes:
     - ✅ `.../auth/userinfo.email`
     - ✅ `.../auth/userinfo.profile`
     - ✅ `openid`
   - Click **"Update"**
   - Click **"Save and Continue"**

8. Test Users Page:
   - Click **"Add Users"**
   - Add your email address (for testing)
   - Click **"Add"**
   - Click **"Save and Continue"**

9. Summary Page:
   - Review your settings
   - Click **"Back to Dashboard"**

### Step 5: Create OAuth 2.0 Client ID

1. In the left sidebar, click **"APIs & Services"** → **"Credentials"**

2. Click **"+ Create Credentials"** at the top

3. Select **"OAuth 2.0 Client ID"**

4. Configure the Client:
   ```
   Application type: Web application
   Name: CivicBridge Web Client
   ```

5. Add Authorized JavaScript Origins:
   - Click **"+ Add URI"**
   - Enter: `http://localhost:5173`
   - Click **"+ Add URI"** again
   - Enter: `http://localhost:3000` (if using different port)

6. Add Authorized Redirect URIs:
   - Click **"+ Add URI"**
   - Enter: `http://localhost:5173/auth/callback`
   - Click **"+ Add URI"** again
   - Enter: `http://localhost:5173/` (fallback)

7. Click **"Create"**

### Step 6: Save Your Credentials

A popup will appear with your credentials:

```
Your Client ID
xxxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com

Your Client Secret
GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**IMPORTANT:**
1. ✅ Copy the **Client ID** - save it somewhere safe
2. ✅ Copy the **Client Secret** - save it somewhere safe
3. ✅ Click **"Download JSON"** (optional backup)
4. Click **"OK"**

### Step 7: Note Your Credentials

Write down or save these values:

```
Google Client ID: 
[paste your client ID here]

Google Client Secret:
[paste your client secret here]
```

## ✅ You're Ready!

Now you have:
- ✅ Google Cloud Project created
- ✅ OAuth consent screen configured
- ✅ OAuth 2.0 Client ID created
- ✅ Client ID and Secret saved

## 🚀 Next Steps

1. Keep your credentials handy
2. Run the AWS Cognito setup script:
   ```bash
   cd backend
   python scripts/setup_cognito.py
   ```
3. Enter your credentials when prompted

## 📸 Visual Guide

If you need visual help, here's what to look for:

**Google Cloud Console Homepage:**
- Top bar: Project selector dropdown
- Left sidebar: Navigation menu
- Main area: Dashboard

**Credentials Page:**
- Shows list of all credentials
- "Create Credentials" button at top
- Each credential shows name, type, creation date

**OAuth Client Creation:**
- Form with application type dropdown
- Name field
- Authorized origins section (+ Add URI button)
- Authorized redirect URIs section (+ Add URI button)
- Create button at bottom

## ⚠️ Common Issues

### "OAuth consent screen not configured"
- Solution: Complete Step 4 first before creating credentials

### "Redirect URI mismatch" error later
- Solution: Make sure you added `http://localhost:5173/auth/callback`

### Can't find "Create Credentials" button
- Solution: Make sure you're in "APIs & Services" → "Credentials"

### "API not enabled" error
- Solution: Enable Google+ API and People API (Step 3)

## 🔐 Security Notes

- ✅ Never commit credentials to git
- ✅ Store in .env file (already in .gitignore)
- ✅ Use different credentials for production
- ✅ Rotate credentials periodically
- ✅ Limit scopes to only what you need

## 📞 Need Help?

If you get stuck:
1. Check the Google Cloud Console documentation
2. Verify you're signed in with the correct Google account
3. Make sure you have project creation permissions
4. Try refreshing the page if buttons don't appear

---

**Once you have your credentials, come back and we'll run the AWS Cognito setup!**
