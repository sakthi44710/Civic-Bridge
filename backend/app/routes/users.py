"""
User Routes - Profile Management
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.models.user import ProfileUpdate, UserProfile
from app.services.auth_service import auth_service
from app.services.dynamodb_service import db
from app.services.document_service import document_service
from app.utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

# Maps known detail field names to profile DB keys (same as ws.py)
_PROFILE_FIELD_MAP = {
    "name": "name", "full_name": "name", "date_of_birth": "dob", "dob": "dob",
    "gender": "gender", "state": "state", "district": "district",
    "pincode": "pincode", "address": "address",
    "annual_income": "annual_income", "income": "annual_income",
    "occupation": "occupation", "category": "category", "caste": "category",
    "education_level": "education_level", "qualification": "education_level",
    "email": "email", "phone": "phone_number", "mobile": "phone_number",
    "aadhaar_number": "aadhaar_number", "pan_number": "pan_number",
    "bank_name": "bank_name", "bank_account": "bank_account",
    "ifsc_code": "ifsc_code", "ifsc": "ifsc_code",
    "father_name": "father_name", "mother_name": "mother_name",
}


class KnownDetailUpdate(BaseModel):
    field_name: str
    value: str


@router.get("/me")
async def get_profile(user_id: str = Depends(get_current_user)):
    """Get current user profile"""
    profile = auth_service.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@router.put("/me")
async def update_profile(data: ProfileUpdate, user_id: str = Depends(get_current_user)):
    """Update user profile"""
    updates = data.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = auth_service.update_profile(user_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


def _update_known_detail_in_docs(user_id: str, field_name: str, value: Optional[str]):
    """Update or clear a field across all document extracted_data records."""
    docs = document_service.get_user_documents(user_id)
    updated = 0
    for doc in docs:
        extracted = doc.get("extracted_data", {})
        if not isinstance(extracted, dict):
            continue
        changed = False
        # Top-level field
        if field_name in extracted:
            if value is None:
                del extracted[field_name]
            else:
                extracted[field_name] = value
            changed = True
        # Nested field
        for k, v in list(extracted.items()):
            if isinstance(v, dict) and field_name in v:
                if value is None:
                    del v[field_name]
                else:
                    v[field_name] = value
                changed = True
        if changed:
            db.update_document(user_id, doc["document_id"], {"extracted_data": extracted})
            updated += 1
    return updated


@router.put("/me/known-details")
async def update_known_detail(body: KnownDetailUpdate, user_id: str = Depends(get_current_user)):
    """Update a known detail field in profile and document extracted data."""
    field = body.field_name.lower().replace(" ", "_")
    value = body.value.strip()
    if not field or not value:
        raise HTTPException(status_code=400, detail="field_name and value are required")

    # Update profile if field maps to a profile key
    profile_key = _PROFILE_FIELD_MAP.get(field)
    if profile_key:
        if profile_key == "annual_income":
            try:
                val = int(float(value))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid numeric value for {field}")
        else:
            val = value
        try:
            db.update_user(user_id, {profile_key: val})
        except Exception as e:
            logger.error(f"Profile update for {profile_key}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to update profile field '{field}'")

    # Always store in extra_details so it shows in Known Details UI
    try:
        user = db.get_user(user_id) or {}
        extra = user.get("extra_details") or {}
        extra[field] = value
        db.update_user(user_id, {"extra_details": extra})
    except Exception as e:
        logger.warning(f"Extra detail update for {field}: {e}")

    # Update across all document extracted_data
    try:
        doc_count = _update_known_detail_in_docs(user_id, field, value)
    except Exception as e:
        logger.error(f"Document update for {field}: {e}")
        doc_count = 0

    return {"message": f"Updated '{field}' to '{value}'", "documents_updated": doc_count}


@router.delete("/me/known-details/{field_name}")
async def delete_known_detail(field_name: str, user_id: str = Depends(get_current_user)):
    """Delete/clear a known detail field from profile and documents."""
    field = field_name.lower().replace(" ", "_")

    # Clear from profile if mapped
    profile_key = _PROFILE_FIELD_MAP.get(field)
    if profile_key:
        try:
            db.update_user(user_id, {profile_key: None})
        except Exception as e:
            logger.warning(f"Profile clear for {profile_key}: {e}")

    # Always remove from extra_details
    try:
        user = db.get_user(user_id) or {}
        extra = user.get("extra_details") or {}
        if field in extra:
            del extra[field]
            db.update_user(user_id, {"extra_details": extra})
    except Exception as e:
        logger.warning(f"Extra detail delete for {field}: {e}")

    # Remove from all document extracted_data
    doc_count = _update_known_detail_in_docs(user_id, field, None)

    return {"message": f"Deleted '{field}'", "documents_updated": doc_count}


@router.get("/me/dashboard")
async def get_dashboard(user_id: str = Depends(get_current_user)):
    """Get user dashboard summary"""
    from app.services.dynamodb_service import db
    
    try:
        profile = db.get_user(user_id)
    except Exception:
        profile = None
    
    if not profile:
        # Return minimal dashboard when profile unavailable
        return {
            "user": {
                "name": "",
                "phone_number": "",
                "preferred_language": "en",
                "profile_completion": 0,
            },
            "documents_count": 0,
            "applications_count": 0,
            "applications_summary": {},
            "recent_applications": [],
        }
    
    try:
        documents = db.get_user_documents(user_id)
    except Exception:
        documents = []
    
    try:
        applications = db.get_user_applications(user_id)
    except Exception:
        applications = []
    
    # Count by status
    app_summary = {}
    for app in applications:
        status = app.get("status", "unknown")
        app_summary[status] = app_summary.get(status, 0) + 1
    
    return {
        "user": {
            "name": profile.get("name", ""),
            "phone_number": profile.get("phone_number", ""),
            "preferred_language": profile.get("preferred_language", "en"),
            "profile_completion": _calculate_completion(profile),
        },
        "documents_count": len(documents),
        "applications_count": len(applications),
        "applications_summary": app_summary,
        "recent_applications": applications[:5],
    }


def _calculate_completion(profile: dict) -> int:
    """Calculate profile completion percentage"""
    fields = ["name", "dob", "gender", "state", "district", "pincode",
              "address", "annual_income", "category", "occupation",
              "education_level", "bank_account", "ifsc_code"]
    filled = sum(1 for f in fields if profile.get(f))
    return int((filled / len(fields)) * 100)
