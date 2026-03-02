"""
Application Models for CivicBridge
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime
from enum import Enum


class ApplicationStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    DOCUMENTS_PENDING = "documents_pending"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTION_REQUIRED = "action_required"
    BENEFIT_DISBURSED = "benefit_disbursed"


class AutomationStatus(str, Enum):
    NOT_STARTED = "not_started"
    RUNNING = "running"
    PAUSED_OTP = "paused_otp"
    PAUSED_CAPTCHA = "paused_captcha"
    PAUSED_VERIFICATION = "paused_verification"
    COMPLETED = "completed"
    FAILED = "failed"


class StatusChange(BaseModel):
    status: ApplicationStatus
    timestamp: str
    details: Optional[str] = None
    source: str = "system"  # system, portal_check, user


class ApplicationCreate(BaseModel):
    scheme_id: str
    form_data: Optional[Dict] = None


class Application(BaseModel):
    application_id: str
    user_id: str
    scheme_id: str
    scheme_name: str
    
    # Status
    status: ApplicationStatus = ApplicationStatus.DRAFT
    automation_status: AutomationStatus = AutomationStatus.NOT_STARTED
    
    # Form Data
    form_data: Dict = {}
    documents_used: List[str] = []  # List of document_ids
    
    # Portal Reference
    portal_application_id: Optional[str] = None
    portal_url: Optional[str] = None
    
    # Automation State
    current_page: int = 0
    total_pages: int = 0
    screenshots: List[str] = []  # S3 URLs
    browser_session_id: Optional[str] = None
    
    # Acknowledgment
    acknowledgment_number: Optional[str] = None
    acknowledgment_url: Optional[str] = None
    
    # Benefit Details
    approved_amount: Optional[int] = None
    disbursement_date: Optional[str] = None
    
    # Timeline
    status_history: List[StatusChange] = []
    
    # Timestamps
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    submitted_at: Optional[str] = None


class ApplicationResponse(BaseModel):
    application_id: str
    scheme_id: str
    scheme_name: str
    status: ApplicationStatus
    automation_status: AutomationStatus
    portal_application_id: Optional[str] = None
    created_at: str
    submitted_at: Optional[str] = None


class ApplicationUpdate(BaseModel):
    form_data: Optional[Dict] = None
    status: Optional[ApplicationStatus] = None


class OTPSubmit(BaseModel):
    application_id: str
    otp: str = Field(..., pattern=r"^\d{4,6}$")


class CaptchaSubmit(BaseModel):
    application_id: str
    captcha_text: str


class VerificationResponse(BaseModel):
    application_id: str
    approved: bool
    corrections: Optional[Dict] = None
