"""
Document Models for CivicBridge
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime
from enum import Enum


class DocumentType(str, Enum):
    AADHAAR = "aadhaar"
    PAN = "pan"
    VOTER_ID = "voter_id"
    DRIVING_LICENSE = "driving_license"
    PASSPORT = "passport"
    INCOME_CERTIFICATE = "income_certificate"
    CASTE_CERTIFICATE = "caste_certificate"
    DOMICILE_CERTIFICATE = "domicile_certificate"
    BIRTH_CERTIFICATE = "birth_certificate"
    BANK_PASSBOOK = "bank_passbook"
    MARKSHEET_10TH = "marksheet_10th"
    MARKSHEET_12TH = "marksheet_12th"
    DEGREE_CERTIFICATE = "degree_certificate"
    DISABILITY_CERTIFICATE = "disability_certificate"
    RATION_CARD = "ration_card"
    LAND_RECORD = "land_record"
    OTHER = "other"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    VERIFIED = "verified"


class DocumentUpload(BaseModel):
    filename: str
    content_type: str
    document_type: Optional[DocumentType] = None


class Document(BaseModel):
    document_id: str
    user_id: str
    original_filename: str
    ai_generated_name: Optional[str] = None
    document_type: DocumentType
    category: str  # identity, financial, educational, etc.
    s3_key: str
    s3_url: Optional[str] = None
    
    # Processing
    status: DocumentStatus = DocumentStatus.PENDING
    ocr_text: Optional[str] = None
    extracted_data: Optional[Dict] = None
    ocr_confidence: Optional[float] = None
    
    # Metadata
    file_size: Optional[int] = None
    content_type: Optional[str] = None
    content_hash: Optional[str] = None
    
    # Dates
    expiry_date: Optional[str] = None
    upload_date: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    processed_date: Optional[str] = None
    
    is_verified: bool = False


class DocumentResponse(BaseModel):
    document_id: str
    document_type: DocumentType
    original_filename: str
    ai_generated_name: Optional[str] = None
    status: DocumentStatus
    extracted_data: Optional[Dict] = None
    upload_date: str


class ExtractedAadhaar(BaseModel):
    name: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    aadhaar_number: Optional[str] = None
    address: Optional[str] = None


class ExtractedIncomeCertificate(BaseModel):
    name: Optional[str] = None
    annual_income: Optional[int] = None
    certificate_number: Optional[str] = None
    issue_date: Optional[str] = None
    valid_until: Optional[str] = None
    issuing_authority: Optional[str] = None


class ExtractedMarksheet(BaseModel):
    name: Optional[str] = None
    roll_number: Optional[str] = None
    board: Optional[str] = None
    year: Optional[str] = None
    percentage: Optional[float] = None
    grade: Optional[str] = None
    subjects: Optional[List[Dict]] = None
