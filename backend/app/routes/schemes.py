"""
Scheme Routes - Scheme Discovery and Eligibility
"""
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from app.services.scheme_service import scheme_service
from app.services.dynamodb_service import db
from app.utils.auth import get_current_user

router = APIRouter(prefix="/schemes", tags=["Schemes"])


def _sanitize(obj):
    """Recursively convert Decimal values (from DynamoDB) to int/float for JSON."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    return obj


@router.get("/")
async def list_schemes(
    category: Optional[str] = Query(None, description="Filter by category"),
    state: Optional[str] = Query(None, description="Filter by state"),
    query: Optional[str] = Query(None, description="Search query"),
):
    """Search and list government schemes"""
    schemes = scheme_service.search_schemes(query=query, category=category, state=state)
    return {
        "schemes": _sanitize(schemes),
        "total": len(schemes),
        "categories": ["education", "healthcare", "agriculture", "welfare"],
    }


@router.get("/categories")
async def get_categories():
    """Get available scheme categories (derived from actual data)"""
    return {"categories": scheme_service.list_categories()}


@router.get("/match")
async def match_schemes(user_id: str = Depends(get_current_user)):
    """Find eligible schemes for current user"""
    try:
        profile = db.get_user(user_id)
    except Exception:
        profile = None
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Please complete your profile first.")
    
    try:
        matches = scheme_service.match_schemes(profile)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Matching error: {str(e)}")
    
    return {
        "matches": _sanitize(matches),
        "total": len(matches),
        "profile_fields_used": [k for k in profile.keys() if profile[k] and k not in ["user_id", "created_at", "updated_at"]],
    }


@router.get("/{scheme_id}")
async def get_scheme(scheme_id: str):
    """Get scheme details"""
    scheme = scheme_service.get_scheme(scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return _sanitize(scheme)


@router.get("/{scheme_id}/eligibility")
async def check_eligibility(scheme_id: str, user_id: str = Depends(get_current_user)):
    """Check eligibility for a specific scheme"""
    try:
        profile = db.get_user(user_id)
    except Exception:
        profile = None
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Please complete your profile first.")
    
    result = scheme_service.check_eligibility(profile, scheme_id)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    
    # Also check document readiness
    from app.services.document_service import document_service
    scheme = scheme_service.get_scheme(scheme_id)
    if scheme:
        doc_check = document_service.check_required_documents(
            user_id, scheme.get("required_documents", [])
        )
        result["document_readiness"] = doc_check
    
    return result
