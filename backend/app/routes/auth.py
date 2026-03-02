"""
Auth Routes - Phone + Email OTP Authentication with Google OAuth
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.models.user import UserCreate, UserLogin, OTPRequest, UserResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/send-otp", status_code=status.HTTP_200_OK)
async def send_otp(data: OTPRequest):
    """Send OTP to phone number and email"""
    result = auth_service.send_otp(data.phone_number, email=data.email)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to send OTP"))
    return {"message": "OTP sent successfully", "phone_number": data.phone_number}


@router.post("/verify-otp")
async def verify_otp(data: UserLogin):
    """Verify OTP and get JWT token"""
    result = auth_service.verify_otp_and_login(data.phone_number, data.otp)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid OTP or OTP expired")
    return result


@router.post("/register")
async def register(data: UserCreate):
    """Register new user with phone OTP"""
    user = auth_service.register_user(
        phone_number=data.phone_number,
        name=data.name,
        preferred_language=data.preferred_language,
        email=data.email
    )
    return user


class GoogleAuthRequest(BaseModel):
    id_token: str
    name: Optional[str] = None
    email: Optional[str] = None
    preferred_language: str = "en"


@router.post("/google")
async def google_auth(data: GoogleAuthRequest):
    """Authenticate via Google OAuth"""
    result = auth_service.google_oauth_login(
        id_token=data.id_token,
        name=data.name,
        email=data.email,
        preferred_language=data.preferred_language
    )
    if not result:
        raise HTTPException(status_code=401, detail="Google authentication failed")
    return result
