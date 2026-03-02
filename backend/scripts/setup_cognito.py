"""
AWS Cognito Setup Script for Google OAuth
Run this script to automatically configure Cognito User Pool with Google OAuth
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.cognito_service import cognito_service
from app.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def setup_cognito_for_google_oauth():
    """
    Complete setup of AWS Cognito with Google OAuth
    
    Steps:
    1. Create User Pool
    2. Create User Pool Client
    3. Configure Google as Identity Provider
    4. Create User Pool Domain
    5. Display configuration details
    """
    print("\n" + "="*60)
    print("AWS Cognito Setup for Google OAuth")
    print("="*60 + "\n")
    
    # Check if already configured
    if settings.COGNITO_USER_POOL_ID and settings.COGNITO_CLIENT_ID:
        print("⚠️  Cognito already configured!")
        print(f"   User Pool ID: {settings.COGNITO_USER_POOL_ID}")
        print(f"   Client ID: {settings.COGNITO_CLIENT_ID}")
        
        response = input("\nDo you want to reconfigure? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            print("Exiting...")
            return
    
    # Get Google OAuth credentials
    print("\n📋 Step 1: Google OAuth Credentials")
    print("-" * 60)
    print("You need Google OAuth credentials from:")
    print("https://console.cloud.google.com/apis/credentials")
    print()
    
    google_client_id = input("Enter Google Client ID: ").strip()
    if not google_client_id:
        print("❌ Google Client ID is required!")
        return
    
    google_client_secret = input("Enter Google Client Secret: ").strip()
    if not google_client_secret:
        print("❌ Google Client Secret is required!")
        return
    
    # Step 1: Create User Pool
    print("\n🔧 Step 2: Creating Cognito User Pool...")
    print("-" * 60)
    
    user_pool_id = cognito_service.create_user_pool("CivicBridge-Users")
    if not user_pool_id:
        print("❌ Failed to create User Pool!")
        return
    
    print(f"✅ User Pool created: {user_pool_id}")
    
    # Step 2: Create User Pool Client
    print("\n🔧 Step 3: Creating User Pool Client...")
    print("-" * 60)
    
    client_config = cognito_service.create_user_pool_client(
        user_pool_id,
        "CivicBridge-Web"
    )
    if not client_config:
        print("❌ Failed to create User Pool Client!")
        return
    
    client_id = client_config['client_id']
    client_secret = client_config['client_secret']
    
    print(f"✅ Client created: {client_id}")
    
    # Step 3: Configure Google Identity Provider
    print("\n🔧 Step 4: Configuring Google Identity Provider...")
    print("-" * 60)
    
    success = cognito_service.configure_google_identity_provider(
        user_pool_id,
        google_client_id,
        google_client_secret
    )
    
    if not success:
        print("❌ Failed to configure Google provider!")
        return
    
    print("✅ Google provider configured")
    
    # Step 4: Create User Pool Domain
    print("\n🔧 Step 5: Creating User Pool Domain...")
    print("-" * 60)
    
    domain_prefix = input("Enter domain prefix (e.g., civicbridge-auth): ").strip()
    if not domain_prefix:
        domain_prefix = "civicbridge-auth"
    
    try:
        import boto3
        cognito_client = boto3.client('cognito-idp', region_name=settings.AWS_REGION)
        cognito_client.create_user_pool_domain(
            Domain=domain_prefix,
            UserPoolId=user_pool_id
        )
        print(f"✅ Domain created: {domain_prefix}")
    except Exception as e:
        print(f"⚠️  Domain creation failed: {e}")
        print("   You can create it manually in AWS Console")
    
    # Display configuration
    print("\n" + "="*60)
    print("✅ Setup Complete!")
    print("="*60)
    print("\n📝 Add these to your .env file:")
    print("-" * 60)
    print(f"COGNITO_USER_POOL_ID={user_pool_id}")
    print(f"COGNITO_CLIENT_ID={client_id}")
    print(f"COGNITO_CLIENT_SECRET={client_secret}")
    print(f"COGNITO_DOMAIN={domain_prefix}")
    print(f"COGNITO_REGION={settings.AWS_REGION}")
    print(f"GOOGLE_CLIENT_ID={google_client_id}")
    print(f"GOOGLE_CLIENT_SECRET={google_client_secret}")
    print("-" * 60)
    
    # Display Hosted UI URL
    hosted_ui_url = (
        f"https://{domain_prefix}.auth.{settings.AWS_REGION}.amazoncognito.com/oauth2/authorize"
        f"?client_id={client_id}"
        f"&response_type=code"
        f"&scope=email+openid+profile"
        f"&redirect_uri=http://localhost:5173/auth/callback"
        f"&identity_provider=Google"
    )
    
    print("\n🌐 Hosted UI URL:")
    print("-" * 60)
    print(hosted_ui_url)
    print("-" * 60)
    
    print("\n📋 Next Steps:")
    print("-" * 60)
    print("1. Add the environment variables to your .env file")
    print("2. Add this redirect URI to your Google OAuth app:")
    print(f"   https://{domain_prefix}.auth.{settings.AWS_REGION}.amazoncognito.com/oauth2/idpresponse")
    print("3. Restart your backend server")
    print("4. Test Google OAuth login from your frontend")
    print("-" * 60)
    
    print("\n✨ All done! Your Google OAuth is ready to use.\n")


if __name__ == "__main__":
    try:
        setup_cognito_for_google_oauth()
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup cancelled by user")
    except Exception as e:
        logger.error(f"Setup failed: {e}", exc_info=True)
        print(f"\n❌ Setup failed: {e}")
