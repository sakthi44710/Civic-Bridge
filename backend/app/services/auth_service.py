"""
Auth Service - OTP Generation, Verification, JWT Token Management
Uses Twilio for SMS OTP delivery. Google OAuth support.
"""
import logging
from typing import Optional, Dict
from app.services.dynamodb_service import db
from app.utils.auth import generate_otp, generate_uuid, create_access_token
from app.utils.helpers import now_iso
from app.config import settings

logger = logging.getLogger(__name__)

# Dev mode OTP store (when DynamoDB is not available)
_dev_otp_store: Dict[str, str] = {}

# Track verified phone numbers (for registration flow)
_verified_phones: Dict[str, str] = {}  # phone -> timestamp

# Twilio client (lazy init)
_twilio_client = None


def _get_twilio():
    """Lazy Twilio client initialization"""
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    try:
        from twilio.rest import Client
        sid = settings.TWILIO_ACCOUNT_SID
        token = settings.TWILIO_AUTH_TOKEN
        if sid and token:
            _twilio_client = Client(sid, token)
            logger.info("Twilio client initialized")
            return _twilio_client
        else:
            logger.warning("Twilio credentials not configured")
    except Exception as e:
        logger.error(f"Failed to init Twilio client: {e}")
    return None


class AuthService:
    """Handles authentication flow: Phone+Email OTP → JWT Token"""
    
    def send_otp(self, phone_number: str, email: str = None) -> Dict:
        """Generate OTP and send via Twilio SMS"""
        otp = generate_otp()
        
        # Store OTP in DynamoDB (or dev store)
        try:
            db.save_otp(phone_number, otp)
        except Exception as e:
            logger.warning(f"DynamoDB not available, using dev OTP store: {e}")
            _dev_otp_store[phone_number] = otp
        
        # Send OTP via Twilio SMS
        twilio = _get_twilio()
        if twilio:
            try:
                # Format: ensure +91 prefix for Indian numbers
                to_number = phone_number if phone_number.startswith('+') else f"+91{phone_number}"
                twilio.messages.create(
                    body=f"Your CivicBridge verification code is: {otp}. Valid for 5 minutes.",
                    from_=settings.TWILIO_PHONE_NUMBER,
                    to=to_number,
                )
                logger.info(f"OTP sent to {phone_number} via Twilio")
            except Exception as e:
                logger.error(f"Twilio SMS failed: {e}")
        else:
            logger.info(f"Twilio not configured — OTP not sent via SMS")
        
        # Always log OTP for dev/debug (visible in backend terminal)
        logger.info(f"DEV OTP for {phone_number}: {otp}")
        
        return {"success": True, "message": "OTP sent successfully", "phone_number": phone_number, "dev_otp": otp}
    
    def verify_otp_and_login(self, phone_number: str, otp: str) -> Optional[Dict]:
        """Verify OTP and return JWT token"""
        # Try DynamoDB first, fall back to dev store
        try:
            is_valid = db.verify_otp(phone_number, otp)
        except Exception:
            is_valid = _dev_otp_store.get(phone_number) == otp
            if is_valid:
                del _dev_otp_store[phone_number]
        
        if not is_valid:
            return None
        
        # Check if user exists
        try:
            user = db.get_user_by_phone(phone_number)
        except Exception:
            user = None
        
        if not user:
            # Track as verified for registration flow
            _verified_phones[phone_number] = now_iso()
            return {"is_new_user": True, "phone_number": phone_number}
        
        # Generate JWT token
        token = create_access_token({"user_id": user["user_id"], "phone": phone_number})
        
        return {
            "is_new_user": False,
            "user_id": user["user_id"],
            "name": user.get("name", ""),
            "phone_number": phone_number,
            "preferred_language": user.get("preferred_language", "en"),
            "access_token": token
        }
    
    def register_user(self, phone_number: str, name: str, 
                      preferred_language: str = "en", email: str = None) -> Dict:
        """Register a new user after OTP verification"""
        # Check if phone was verified (from verify_otp_and_login flow)
        if phone_number not in _verified_phones:
            logger.warning(f"Registration attempt for unverified phone: {phone_number}")
        else:
            del _verified_phones[phone_number]
        
        user_id = generate_uuid()
        user_data = {
            "user_id": user_id,
            "phone_number": phone_number,
            "name": name,
            "email": email or "",
            "preferred_language": preferred_language,
            "profile_complete": False,
        }
        
        try:
            # Check if already exists
            existing = db.get_user_by_phone(phone_number)
            if existing:
                token = create_access_token({
                    "user_id": existing["user_id"], 
                    "phone": phone_number
                })
                existing["access_token"] = token
                return existing
            
            db.create_user(user_data)
        except Exception as e:
            logger.warning(f"DynamoDB not available for registration: {e}")
        
        token = create_access_token({"user_id": user_id, "phone": phone_number})
        user_data["access_token"] = token
        
        logger.info(f"New user registered: {user_id}")
        return user_data
    
    def google_oauth_login(self, id_token: str, name: str = None, 
                           email: str = None, preferred_language: str = "en") -> Optional[Dict]:
        """Handle Google OAuth login - verify token and create/login user"""
        # Verify Google ID token
        google_data = self._verify_google_token(id_token)
        if not google_data:
            return None
        
        g_email = google_data.get("email") or email
        g_name = google_data.get("name") or name or "User"
        
        if not g_email:
            return None
        
        # Check if user exists by email
        try:
            users = db.scan_table(settings.USERS_TABLE)
            existing = None
            for u in users:
                if u.get("email") == g_email:
                    existing = u
                    break
            
            if existing:
                token = create_access_token({
                    "user_id": existing["user_id"],
                    "phone": existing.get("phone_number", "")
                })
                return {
                    "is_new_user": False,
                    "user_id": existing["user_id"],
                    "name": existing.get("name", g_name),
                    "email": g_email,
                    "phone_number": existing.get("phone_number", ""),
                    "preferred_language": existing.get("preferred_language", preferred_language),
                    "access_token": token
                }
        except Exception as e:
            logger.warning(f"Could not search users: {e}")
        
        # Create new user
        user_id = generate_uuid()
        user_data = {
            "user_id": user_id,
            "name": g_name,
            "email": g_email,
            "phone_number": "",
            "preferred_language": preferred_language,
            "profile_complete": False,
            "auth_provider": "google",
        }
        
        try:
            db.create_user(user_data)
        except Exception as e:
            logger.warning(f"Could not create Google user: {e}")
        
        token = create_access_token({"user_id": user_id, "phone": ""})
        user_data["access_token"] = token
        user_data["is_new_user"] = True
        
        return user_data
    
    def _verify_google_token(self, id_token: str) -> Optional[Dict]:
        """Verify Google OAuth ID token using AWS Cognito or Google API"""
        # Try AWS Cognito first (token is a Cognito JWT from hosted UI)
        if settings.COGNITO_USER_POOL_ID and settings.COGNITO_CLIENT_ID:
            cognito_result = self._verify_with_cognito(id_token)
            if cognito_result:
                logger.info("Token verified via Cognito JWKS")
                return cognito_result
        
        # Fallback to direct Google verification (for direct Google tokens)
        try:
            from google.oauth2 import id_token as google_id_token
            from google.auth.transport import requests
            
            idinfo = google_id_token.verify_oauth2_token(
                id_token, 
                requests.Request(), 
                settings.GOOGLE_CLIENT_ID
            )
            
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                logger.error("Invalid token issuer")
                return None
            
            logger.info("Token verified via Google API")
            return {
                "email": idinfo.get("email"),
                "name": idinfo.get("name"),
                "picture": idinfo.get("picture"),
                "sub": idinfo.get("sub"),
                "email_verified": idinfo.get("email_verified", False),
            }
        except Exception as e:
            logger.warning(f"Google token verification failed: {e}")
        
        # Development fallback: decode JWT without verification
        # Safe when token came from Cognito's token endpoint via authorization code flow
        if settings.ENVIRONMENT == "development":
            try:
                import json, base64
                # Decode JWT payload without verification
                payload_b64 = id_token.split('.')[1]
                # Add padding if needed
                padding = 4 - len(payload_b64) % 4
                if padding != 4:
                    payload_b64 += '=' * padding
                payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                
                email = payload.get("email")
                if email:
                    logger.warning(f"DEV MODE: Using unverified token claims for {email}")
                    return {
                        "email": email,
                        "name": payload.get("name") or payload.get("cognito:username", ""),
                        "picture": payload.get("picture", ""),
                        "sub": payload.get("sub", ""),
                        "email_verified": payload.get("email_verified", False),
                    }
            except Exception as e:
                logger.error(f"Dev fallback decode failed: {e}")
        
        return None
    
    def _verify_with_cognito(self, id_token: str) -> Optional[Dict]:
        """Verify Google OAuth token via AWS Cognito"""
        try:
            import boto3
            from jose import jwt, JWTError
            import httpx
            
            # Get Cognito JWKS
            region = settings.COGNITO_REGION
            user_pool_id = settings.COGNITO_USER_POOL_ID
            jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
            
            resp = httpx.get(jwks_url)
            jwks = resp.json()
            
            # Decode and verify token
            header = jwt.get_unverified_header(id_token)
            key = None
            for k in jwks['keys']:
                if k['kid'] == header['kid']:
                    key = k
                    break
            
            if not key:
                logger.error("Public key not found in JWKS")
                return None
            
            # Verify token
            payload = jwt.decode(
                id_token,
                key,
                algorithms=['RS256'],
                audience=settings.COGNITO_CLIENT_ID,
                issuer=f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
            )
            
            return {
                "email": payload.get("email"),
                "name": payload.get("name"),
                "picture": payload.get("picture"),
                "sub": payload.get("sub"),
                "email_verified": payload.get("email_verified", False),
            }
        except JWTError as e:
            logger.error(f"Cognito JWT verification failed: {e}")
        except Exception as e:
            logger.error(f"Cognito verification failed: {e}")
        
        return None
    
    def get_profile(self, user_id: str) -> Optional[Dict]:
        """Get user profile"""
        try:
            return db.get_user(user_id)
        except Exception as e:
            logger.warning(f"Cannot get profile: {e}")
            return None
    
    def update_profile(self, user_id: str, updates: Dict) -> Optional[Dict]:
        """Update user profile"""
        try:
            required_fields = ["name", "dob", "gender", "state", "district"]
            user = db.get_user(user_id)
            if user:
                merged = {**user, **updates}
                if all(merged.get(f) for f in required_fields):
                    updates["profile_complete"] = True
            return db.update_user(user_id, updates)
        except Exception as e:
            logger.warning(f"Cannot update profile: {e}")
            return None


# Singleton
auth_service = AuthService()
