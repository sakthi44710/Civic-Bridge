"""
CivicBridge Configuration
AWS Free Tier Settings
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "CivicBridge"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    
    # AWS Configuration
    AWS_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    
    # DynamoDB Tables
    USERS_TABLE: str = "civicbridge-users"
    DOCUMENTS_TABLE: str = "civicbridge-documents"
    APPLICATIONS_TABLE: str = "civicbridge-applications"
    SCHEMES_TABLE: str = "civicbridge-schemes"
    CONVERSATIONS_TABLE: str = "civicbridge-conversations"
    
    # S3 Buckets
    DOCUMENTS_BUCKET: str = "civicbridge-documents"
    SCREENSHOTS_BUCKET: str = "civicbridge-screenshots"
    
    # AI — Claude Haiku 4.5 via Bedrock (replaces Llama 3 70B for ALL tasks)
    BEDROCK_MODEL_ID: str = "anthropic.claude-haiku-4-5"
    BEDROCK_API_KEY: str = ""          # Bearer token auth (alternative to IAM)
    BEDROCK_API_REGION: str = "ap-south-1"
    
    # JWT Settings
    JWT_SECRET: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    
    # Sarvam AI — Indian language STT + TTS
    SARVAM_API_KEY: str = ""             # From sarvam.ai dashboard

    # AWS SNS OTP (Twilio removed)
    SNS_SENDER_ID: str = "CivicBridge"

    # Live browser (noVNC)
    DISPLAY: str = ":99"
    NOVNC_PORT: int = 6080
    VNC_PORT: int = 5900
    
    # AWS Cognito (Google OAuth)
    COGNITO_USER_POOL_ID: str = ""
    COGNITO_CLIENT_ID: str = ""
    COGNITO_CLIENT_SECRET: str = ""
    COGNITO_DOMAIN: str = ""
    COGNITO_REGION: str = "ap-south-1"
    
    # Google OAuth (Direct - Fallback)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
