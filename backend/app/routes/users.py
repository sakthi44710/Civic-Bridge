"""
User Routes - Profile Management
"""
from fastapi import APIRouter, HTTPException, Depends
from app.models.user import ProfileUpdate, UserProfile
from app.services.auth_service import auth_service
from app.utils.auth import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


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
