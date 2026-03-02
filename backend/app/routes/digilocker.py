"""
DigiLocker Integration Routes
Handles OAuth flow with DigiLocker to fetch user documents
"""
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from app.utils.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/digilocker", tags=["DigiLocker"])

# DigiLocker OAuth endpoints
DIGILOCKER_AUTH_URL = "https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize"
DIGILOCKER_TOKEN_URL = "https://digilocker.meripehchaan.gov.in/public/oauth2/1/token"
DIGILOCKER_DOCS_URL = "https://digilocker.meripehchaan.gov.in/public/oauth2/2/xml/eaadhaar"

# DigiLocker config (to be set via env)
DIGILOCKER_CLIENT_ID = ""
DIGILOCKER_CLIENT_SECRET = ""
DIGILOCKER_REDIRECT_URI = "http://localhost:5173/digilocker/callback"


class DigiLockerInitRequest(BaseModel):
    document_type: Optional[str] = None  # e.g., "ADHAR", "PANCR", "DRVLC"


@router.post("/initiate")
async def initiate_digilocker(
    data: DigiLockerInitRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Initiate DigiLocker OAuth flow.
    Returns the authorization URL to redirect the user to.
    """
    import urllib.parse
    
    if not DIGILOCKER_CLIENT_ID:
        # Return a mock URL for development
        return {
            "auth_url": f"{DIGILOCKER_AUTH_URL}?response_type=code&client_id=demo&redirect_uri={DIGILOCKER_REDIRECT_URI}&state={user_id}",
            "message": "DigiLocker integration requires client credentials. Configure DIGILOCKER_CLIENT_ID in settings.",
            "status": "demo_mode"
        }
    
    params = {
        "response_type": "code",
        "client_id": DIGILOCKER_CLIENT_ID,
        "redirect_uri": DIGILOCKER_REDIRECT_URI,
        "state": user_id,
    }
    
    auth_url = f"{DIGILOCKER_AUTH_URL}?{urllib.parse.urlencode(params)}"
    
    return {
        "auth_url": auth_url,
        "message": "Redirect user to this URL for DigiLocker authorization",
        "status": "ready"
    }


@router.get("/callback")
async def digilocker_callback(
    code: str = Query(...),
    state: str = Query(None),
):
    """
    Handle DigiLocker OAuth callback.
    Exchange authorization code for access token and fetch documents.
    """
    user_id = state
    
    if not DIGILOCKER_CLIENT_ID:
        return {
            "status": "demo_mode",
            "message": "DigiLocker demo mode - no documents fetched",
            "documents": []
        }
    
    try:
        import httpx
        
        # Exchange code for token
        token_resp = httpx.post(DIGILOCKER_TOKEN_URL, data={
            "code": code,
            "grant_type": "authorization_code",
            "client_id": DIGILOCKER_CLIENT_ID,
            "client_secret": DIGILOCKER_CLIENT_SECRET,
            "redirect_uri": DIGILOCKER_REDIRECT_URI,
        })
        
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get DigiLocker token")
        
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        
        # Fetch issued documents list
        docs_resp = httpx.get(
            "https://digilocker.meripehchaan.gov.in/public/oauth2/1/files/issued",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        documents = []
        if docs_resp.status_code == 200:
            docs_data = docs_resp.json()
            documents = docs_data.get("items", [])
        
        return {
            "status": "success",
            "documents": documents,
            "user_id": user_id,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DigiLocker callback error: {e}")
        raise HTTPException(status_code=500, detail="DigiLocker processing failed")


@router.get("/documents")
async def list_digilocker_documents(
    user_id: str = Depends(get_current_user)
):
    """List available document types from DigiLocker"""
    return {
        "available_types": [
            {"code": "ADHAR", "name": "Aadhaar Card", "issuer": "UIDAI"},
            {"code": "PANCR", "name": "PAN Card", "issuer": "Income Tax Department"},
            {"code": "DRVLC", "name": "Driving License", "issuer": "Transport Department"},
            {"code": "VOTERID", "name": "Voter ID", "issuer": "Election Commission"},
            {"code": "PASSPT", "name": "Passport", "issuer": "MEA"},
            {"code": "CBSE10", "name": "Class 10 Marksheet", "issuer": "CBSE"},
            {"code": "CBSE12", "name": "Class 12 Marksheet", "issuer": "CBSE"},
        ],
        "message": "Select documents to fetch from DigiLocker"
    }
