"""
Document Routes - Document Upload, Processing, and Management
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Body
from app.services.document_service import document_service
from app.utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form(None),
    user_id: str = Depends(get_current_user)
):
    """Upload and process a document"""
    content = await file.read()
    
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
    
    allowed_types = [
        "application/pdf", "image/jpeg", "image/png", "image/jpg",
        "image/tiff", "image/bmp", "image/webp"
    ]
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    
    try:
        result = document_service.process_document(
            user_id=user_id,
            file_content=content,
            filename=file.filename or "document",
            content_type=file.content_type or "application/octet-stream",
            document_type=document_type,
        )
    except Exception as e:
        import traceback
        logger.error(f"Document processing error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")
    
    if result.get("status") == "duplicate":
        raise HTTPException(status_code=409, detail=result)
    
    return result


@router.get("/")
async def list_documents(user_id: str = Depends(get_current_user)):
    """Get all documents for current user"""
    try:
        docs = document_service.get_user_documents(user_id)
    except Exception:
        docs = []
    return {"documents": docs, "total": len(docs)}


@router.get("/{document_id}")
async def get_document(document_id: str, user_id: str = Depends(get_current_user)):
    """Get document details"""
    try:
        doc = document_service.get_document(user_id, document_id)
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{document_id}")
async def delete_document(document_id: str, user_id: str = Depends(get_current_user)):
    """Delete a document"""
    try:
        result = document_service.delete_document(user_id, document_id)
    except Exception:
        result = None
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}


@router.get("/{document_id}/download")
async def download_document(document_id: str, user_id: str = Depends(get_current_user)):
    """Get a presigned download URL for a document"""
    try:
        doc = document_service.get_document(user_id, document_id)
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    from app.services.s3_service import s3_service
    s3_key = doc.get("s3_key")
    if not s3_key:
        raise HTTPException(status_code=404, detail="Document file not found")
    
    download_url = s3_service.get_presigned_url(s3_key, expiration=3600)
    return {
        "download_url": download_url,
        "filename": doc.get("ai_generated_name") or doc.get("original_filename", "document"),
        "content_type": doc.get("content_type", "application/octet-stream"),
    }


@router.post("/check-requirements")
async def check_requirements(
    required_documents: List[str] = Body(default=[]),
    user_id: str = Depends(get_current_user)
):
    """Check which required documents the user has"""
    try:
        result = document_service.check_required_documents(user_id, required_documents)
    except Exception:
        result = {"ready": False, "missing": required_documents, "uploaded": []}
    return result
