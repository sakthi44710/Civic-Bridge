"""
Common Utility Functions
"""
import uuid
import hashlib
from datetime import datetime
from typing import Optional


def generate_id() -> str:
    return str(uuid.uuid4())


def generate_short_id() -> str:
    return str(uuid.uuid4())[:8].upper()


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def format_currency(amount: int) -> str:
    """Format Indian currency: ₹1,20,000"""
    s = str(amount)
    if len(s) <= 3:
        return f"₹{s}"
    last_three = s[-3:]
    remaining = s[:-3]
    groups = []
    while remaining:
        groups.insert(0, remaining[-2:] if len(remaining) >= 2 else remaining)
        remaining = remaining[:-2]
    return f"₹{','.join(groups)},{last_three}"


def calculate_age(dob_str: str) -> Optional[int]:
    """Calculate age from DOB string (YYYY-MM-DD or DD/MM/YYYY)"""
    try:
        if "/" in dob_str:
            parts = dob_str.split("/")
            dob = datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        else:
            dob = datetime.fromisoformat(dob_str)
        today = datetime.utcnow()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return age
    except (ValueError, IndexError):
        return None


def validate_aadhaar(number: str) -> bool:
    """Validate Aadhaar number (12 digits)"""
    clean = number.replace(" ", "").replace("-", "")
    return len(clean) == 12 and clean.isdigit()


def validate_pan(pan: str) -> bool:
    """Validate PAN number (10 alphanumeric)"""
    import re
    return bool(re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan.upper()))


def validate_phone(phone: str) -> bool:
    """Validate Indian phone number"""
    clean = phone.replace(" ", "").replace("-", "").replace("+91", "")
    return len(clean) == 10 and clean.isdigit()


def validate_ifsc(ifsc: str) -> bool:
    """Validate IFSC code"""
    import re
    return bool(re.match(r'^[A-Z]{4}0[A-Z0-9]{6}$', ifsc.upper()))


def get_document_category(doc_type: str) -> str:
    """Map document type to category"""
    categories = {
        "aadhaar": "identity", "pan": "identity", "voter_id": "identity",
        "driving_license": "identity", "passport": "identity",
        "income_certificate": "financial", "bank_passbook": "financial",
        "marksheet_10th": "educational", "marksheet_12th": "educational",
        "degree_certificate": "educational",
        "caste_certificate": "social", "disability_certificate": "social",
        "domicile_certificate": "address", "birth_certificate": "identity",
        "ration_card": "social", "land_record": "property",
    }
    return categories.get(doc_type, "other")
