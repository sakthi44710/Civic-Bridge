"""
User Models for CivicBridge
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Category(str, Enum):
    GENERAL = "general"
    OBC = "obc"
    SC = "sc"
    ST = "st"
    EWS = "ews"


class UserCreate(BaseModel):
    phone_number: str = Field(..., pattern=r"^\d{10}$")
    email: Optional[str] = None
    otp: str = Field(..., pattern=r"^\d{6}$")
    name: str = Field(..., min_length=2, max_length=100)
    preferred_language: str = Field(default="en")


class UserProfile(BaseModel):
    user_id: str
    phone_number: str
    name: str
    email: Optional[str] = None
    preferred_language: str = "en"
    
    # Personal Details
    dob: Optional[str] = None
    gender: Optional[Gender] = None
    category: Optional[Category] = None
    
    # Address
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    address: Optional[str] = None
    
    # Financial
    annual_income: Optional[int] = None
    occupation: Optional[str] = None
    
    # Education
    education_level: Optional[str] = None
    
    # Identity
    aadhaar_number: Optional[str] = None
    pan_number: Optional[str] = None
    
    # Bank Details
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    ifsc_code: Optional[str] = None
    
    # Timestamps
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class OTPRequest(BaseModel):
    phone_number: str = Field(..., pattern=r"^\d{10}$")
    email: Optional[str] = None


class UserLogin(BaseModel):
    phone_number: str = Field(..., pattern=r"^\d{10}$")
    otp: str = Field(..., pattern=r"^\d{6}$")


class UserResponse(BaseModel):
    user_id: str
    phone_number: str
    name: str
    preferred_language: str
    access_token: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[Gender] = None
    category: Optional[Category] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    address: Optional[str] = None
    annual_income: Optional[int] = None
    occupation: Optional[str] = None
    education_level: Optional[str] = None
