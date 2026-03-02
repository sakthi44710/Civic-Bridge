"""
Scheme Models for CivicBridge
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from enum import Enum


class SchemeCategory(str, Enum):
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    SOCIAL_WELFARE = "social_welfare"
    AGRICULTURE = "agriculture"
    EMPLOYMENT = "employment"
    HOUSING = "housing"


class SchemeStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    UPCOMING = "upcoming"
    EXPIRED = "expired"


class EligibilityCriteria(BaseModel):
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    gender: Optional[List[str]] = None  # ["male", "female", "other"]
    categories: Optional[List[str]] = None  # ["general", "obc", "sc", "st"]
    max_income: Optional[int] = None
    min_income: Optional[int] = None
    education_level: Optional[List[str]] = None
    states: Optional[List[str]] = None  # [] means all India
    occupation: Optional[List[str]] = None
    is_disabled: Optional[bool] = None
    is_minority: Optional[bool] = None
    is_widow: Optional[bool] = None
    is_farmer: Optional[bool] = None


class RequiredDocument(BaseModel):
    document_type: str
    is_mandatory: bool = True
    alternatives: Optional[List[str]] = None


class Scheme(BaseModel):
    scheme_id: str
    name: str
    name_hindi: Optional[str] = None
    description: str
    description_hindi: Optional[str] = None
    category: SchemeCategory
    subcategory: Optional[str] = None
    
    # Benefits
    benefit_type: str  # "cash", "subsidy", "service", "loan"
    benefit_amount: Optional[int] = None  # In rupees
    benefit_description: Optional[str] = None
    
    # Eligibility
    eligibility_criteria: EligibilityCriteria
    required_documents: List[RequiredDocument]
    
    # Application
    portal_url: Optional[str] = None
    application_deadline: Optional[str] = None
    application_process: Optional[str] = None
    
    # Location
    state: Optional[str] = None  # None = Central scheme
    district: Optional[str] = None
    
    # Status
    status: SchemeStatus = SchemeStatus.ACTIVE
    
    # Metadata
    ministry: Optional[str] = None
    department: Optional[str] = None
    helpline: Optional[str] = None
    
    # Form Automation Config
    automation_config: Optional[Dict] = None


class SchemeMatch(BaseModel):
    scheme_id: str
    name: str
    category: SchemeCategory
    benefit_amount: Optional[int] = None
    match_score: float  # 0-100
    eligibility_status: str  # "eligible", "likely_eligible", "not_eligible"
    missing_documents: List[str] = []
    missing_info: List[str] = []


class SchemeSearchRequest(BaseModel):
    query: Optional[str] = None
    category: Optional[SchemeCategory] = None
    state: Optional[str] = None
    max_income: Optional[int] = None


class SchemeSearchResponse(BaseModel):
    schemes: List[SchemeMatch]
    total_count: int
