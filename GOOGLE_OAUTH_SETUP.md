# Google OAuth Setup Guide for CivicBridge

This guide will help you set up Google OAuth authentication using AWS Cognito for your CivicBridge application.

## Prerequisites

- AWS Account with appropriate permissions
- Google Cloud Platform account
- AWS CLI configured with credentials
- Python virtual environment activated

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen if not done:
   - User Type: External
   - App name: CivicBridge
   - User support email: your-email@example.com
   - Developer contact: your-email@example.com
6. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: CivicBridge Web
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `https://your-domain.com` (production)
   - Authorized redirect URIs:
     - `http://localhost:5173/auth/callback`
     - `https://your-cognito-domain.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse`
7. Save the **Client ID** and **Client Secret**

## Step 2: Run Automated Cognito Setup

We've created an automated setup script that will:
- Create AWS Cognito User Pool
- Create User Pool Client
- Configure Google as Identity Provider
- Set up User Pool Domain

Run the setup script:

```bash
cd backend
python scripts/setup_cognito.py
```

Follow the prompts and enter your Google OAuth credentials when asked.

## Step 3: Update Environment Variables

After the setup script completes, add the displayed configuration to your `.env` file:

```env
# AWS Cognito (Google OAuth)
COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_DOMAIN=civicbridge-auth
COGNITO_REGION=ap-south-1

# Google OAuth (Direct - Fallback)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Step 4: Update Google OAuth Redirect URI

Go back to Google Cloud Console and add the Cognito callback URL to your OAuth app:

1. Navigate to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   https://your-cognito-domain.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse
   ```
4. Save changes

## Step 5: Install Python Dependencies

Install the required packages:

```bash
pip install -r requirements.txt
```

## Step 6: Test the Integration

1. Restart your backend server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

2. The Google OAuth button in your frontend should now work!

## Frontend Integration

The frontend is already configured to use Google OAuth. When a user clicks "Continue with Google":

1. Frontend initiates Google OAuth flow
2. User authenticates with Google
3. Google returns ID token
4. Backend verifies token with AWS Cognito (or Google API as fallback)
5. User is created/logged in with JWT token

## Manual Setup (Alternative)

If you prefer to set up manually via AWS Console:

### Create User Pool

1. Go to AWS Cognito Console
2. Click **Create user pool**
3. Configure sign-in options:
   - Email
4. Configure security requirements:
   - Password policy: Default
   - MFA: Optional
5. Configure sign-up experience:
   - Self-registration: Enabled
   - Required attributes: email, name
6. Configure message delivery:
   - Email provider: Cognito default
7. Integrate your app:
   - User pool name: CivicBridge-Users
   - App client name: CivicBridge-Web
   - Generate client secret: Yes
8. Review and create

### Add Google Identity Provider

1. In your User Pool, go to **Sign-in experience** tab
2. Click **Add identity provider**
3. Select **Google**
4. Enter your Google Client ID and Client Secret
5. Authorize scopes: `email`, `openid`, `profile`
6. Map attributes:
   - email → email
   - name → name
   - picture → picture
7. Save changes

### Create User Pool Domain

1. Go to **App integration** tab
2. Under **Domain**, click **Create Cognito domain**
3. Enter domain prefix (e.g., `civicbridge-auth`)
4. Save changes

### Configure App Client

1. Go to **App integration** tab
2. Click on your app client
3. Edit **Hosted UI** settings:
   - Allowed callback URLs: `http://localhost:5173/auth/callback`
   - Allowed sign-out URLs: `http://localhost:5173/`
   - Identity providers: Select Google
   - OAuth 2.0 grant types: Authorization code grant, Implicit grant
   - OpenID Connect scopes: email, openid, profile
4. Save changes

## Architecture

```
User → Frontend → Google OAuth → AWS Cognito → Backend → DynamoDB
                                      ↓
                              Verify ID Token
                                      ↓
                              Create/Login User
                                      ↓
                              Return JWT Token
```

## Security Features

1. **Token Verification**: ID tokens are verified using AWS Cognito JWKS or Google's verification API
2. **Secure Storage**: User data stored in DynamoDB with encryption at rest
3. **JWT Tokens**: Short-lived access tokens (1 hour) with refresh tokens (30 days)
4. **HTTPS Only**: All OAuth flows use HTTPS in production
5. **CORS Protection**: Strict CORS policy for API endpoints

## Troubleshooting

### Error: "Invalid token issuer"
- Ensure your Google Client ID matches the one in the token
- Check that the token hasn't expired

### Error: "Cognito client not available"
- Verify AWS credentials are configured correctly
- Check that Cognito User Pool exists in the specified region

### Error: "Google authentication failed"
- Verify Google OAuth credentials in .env file
- Check that redirect URIs match in Google Console
- Ensure Cognito domain is correctly configured

### Error: "Public key not found in JWKS"
- Token might be from wrong user pool
- Verify COGNITO_USER_POOL_ID is correct

## Testing

Test the OAuth flow:

```bash
# Test Google OAuth endpoint
curl -X POST http://localhost:8000/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "id_token": "your-google-id-token",
    "preferred_language": "en"
  }'
```

Expected response:
```json
{
  "is_new_user": false,
  "user_id": "uuid",
  "name": "User Name",
  "email": "user@example.com",
  "access_token": "jwt-token",
  "preferred_language": "en"
}
```

## Production Deployment

For production:

1. Update redirect URIs in Google Console with production domain
2. Update Cognito callback URLs with production domain
3. Use environment-specific .env files
4. Enable CloudWatch logging for Cognito
5. Set up monitoring and alerts
6. Use AWS Secrets Manager for sensitive credentials

## Cost Considerations

AWS Cognito Free Tier:
- 50,000 MAUs (Monthly Active Users) free
- Additional users: $0.0055 per MAU

Google OAuth:
- Free for most use cases
- No cost for authentication

## Support

For issues or questions:
- Check AWS Cognito documentation: https://docs.aws.amazon.com/cognito/
- Check Google OAuth documentation: https://developers.google.com/identity/protocols/oauth2
- Review backend logs for detailed error messages

## Next Steps

After successful setup:
1. Test login flow with multiple Google accounts
2. Implement user profile completion flow
3. Add phone number linking for existing users
4. Set up email notifications via AWS SES
5. Configure user pool triggers for custom workflows
