"""
Application Routes - Application Management and Form Automation
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict
from app.services.form_agent_service import form_agent_service
from app.services.tracking_service import tracking_service
from app.services.document_service import document_service
from app.services.scheme_service import scheme_service
from app.services.dynamodb_service import db
from app.utils.auth import get_current_user
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["Applications"])


class StartApplicationRequest(BaseModel):
    scheme_id: str


class VerifyPageRequest(BaseModel):
    approved: bool = True
    corrections: Optional[Dict] = None


class OTPSubmitRequest(BaseModel):
    otp: str


class CaptchaSubmitRequest(BaseModel):
    captcha_text: str


@router.post("/start")
async def start_application(request: StartApplicationRequest, user_id: str = Depends(get_current_user)):
    """Start a new application for a scheme"""
    scheme = scheme_service.get_scheme(request.scheme_id)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    
    try:
        user = db.get_user(user_id)
    except Exception:
        user = None
    
    # Check required documents
    try:
        doc_check = document_service.check_required_documents(
            user_id, scheme.get("required_documents", [])
        )
    except Exception:
        doc_check = {"all_available": False, "missing": scheme.get("required_documents", [])}
    
    # Create application
    application_id = generate_id()
    app_data = {
        "user_id": user_id,
        "application_id": application_id,
        "scheme_id": request.scheme_id,
        "scheme_name": scheme.get("name", ""),
        "status": "draft",
        "automation_status": "not_started",
        "form_data": {},
        "documents_ready": doc_check.get("all_available", False),
        "missing_documents": doc_check.get("missing", []),
        "created_at": now_iso(),
        "status_history": [
            {"status": "draft", "timestamp": now_iso(), "details": "Application created", "source": "user"}
        ],
    }
    
    try:
        db.save_application(app_data)
    except Exception as e:
        logger.warning(f"Could not save application to DynamoDB: {e}")
    
    return {
        "application_id": application_id,
        "scheme_name": scheme.get("name", ""),
        "documents_ready": doc_check.get("all_available", False),
        "missing_documents": doc_check.get("missing", []),
        "has_automation": bool(scheme.get("automation_config")),
        "status": "draft",
    }


@router.get("/")
async def list_applications(user_id: str = Depends(get_current_user)):
    """Get all applications for current user"""
    try:
        apps = tracking_service.get_user_applications(user_id)
    except Exception:
        apps = []
    return {"applications": apps, "total": len(apps)}


@router.get("/{application_id}")
async def get_application(application_id: str, user_id: str = Depends(get_current_user)):
    """Get application details with status history"""
    try:
        result = tracking_service.get_application_status(user_id, application_id)
    except Exception:
        result = None
    if not result:
        raise HTTPException(status_code=404, detail="Application not found")
    return result


@router.post("/{application_id}/automate")
async def start_automation(application_id: str, user_id: str = Depends(get_current_user)):
    """Start browser automation for form filling"""
    try:
        app = db.get_application(user_id, application_id)
    except Exception:
        app = None
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    
    if not app.get("documents_ready"):
        raise HTTPException(status_code=400, detail="Please upload all required documents first")
    
    try:
        user = db.get_user(user_id)
    except Exception:
        user = {}
    
    try:
        documents = db.get_user_documents(user_id)
    except Exception:
        documents = []
    
    try:
        scheme = scheme_service.get_scheme(app["scheme_id"])
        portal_url = (scheme or {}).get("portal_url") or (scheme or {}).get("application_url", "")
        session = await form_agent_service.start_session(
            user_id=user_id,
            scheme_id=app["scheme_id"],
            application_id=application_id,
            user_data=user or {},
            portal_url=portal_url,
            websocket=None,
        )
        result = {"status": "started", "session_id": session.session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Automation failed: {str(e)}")
    
    return result


@router.post("/{application_id}/verify")
async def verify_page(
    application_id: str,
    request: VerifyPageRequest,
    user_id: str = Depends(get_current_user)
):
    """Verify or correct a filled page — now handled via WebSocket form agent"""
    session = form_agent_service.get_session(user_id)
    if not session:
        raise HTTPException(status_code=404, detail="No active form session")
    result = {"status": "ok", "session_id": session.session_id}
    return result


@router.post("/{application_id}/otp")
async def submit_otp(
    application_id: str,
    request: OTPSubmitRequest,
    user_id: str = Depends(get_current_user)
):
    """Submit OTP for portal verification"""
    result = await form_agent_service.submit_otp(user_id, request.otp)
    return result


@router.post("/{application_id}/captcha")
async def submit_captcha(
    application_id: str,
    request: CaptchaSubmitRequest,
    user_id: str = Depends(get_current_user)
):
    """Submit CAPTCHA solution"""
    result = await form_agent_service.submit_captcha(user_id, request.captcha_text)
    return result


@router.post("/{application_id}/submit")
async def final_submit(application_id: str, user_id: str = Depends(get_current_user)):
    """Final submission of the application"""
    session = form_agent_service.get_session(user_id)
    if not session:
        raise HTTPException(status_code=404, detail="No active form session")
    # Close the session (form was submitted in live browser)
    await form_agent_service.close_session(user_id)
    result = {"status": "submitted"}
    
    if result.get("status") == "submitted":
        # Update tracking
        tracking_service.update_status(
            user_id, application_id, "submitted",
            "Application submitted via live browser.",
            source="form_agent"
        )
    
    return result


@router.get("/{application_id}/track")
async def track_application(application_id: str, user_id: str = Depends(get_current_user)):
    """Track application status"""
    result = tracking_service.get_application_status(user_id, application_id)
    if not result:
        raise HTTPException(status_code=404, detail="Application not found")
    return result
