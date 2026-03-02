"""
Translation Routes - Language Detection and Translation
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.services.translate_service import translate_service, LANGUAGE_NAMES
from app.utils.auth import get_current_user

router = APIRouter(prefix="/translate", tags=["Translation"])


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "en"


class BatchTranslateRequest(BaseModel):
    texts: List[str]
    source_language: str = "auto"
    target_language: str = "en"


@router.post("/text")
async def translate_text(request: TranslateRequest, user_id: str = Depends(get_current_user)):
    """Translate text between languages"""
    source = request.source_language
    if source == "auto":
        detected = translate_service.detect_language(request.text)
        source = detected.get("language_code", "en")
    
    result = translate_service.translate(request.text, source, request.target_language)
    return {
        "translated_text": result.get("translated_text", ""),
        "source_language": source,
        "target_language": request.target_language,
    }


@router.post("/batch")
async def translate_batch(request: BatchTranslateRequest, user_id: str = Depends(get_current_user)):
    """Translate multiple texts"""
    source = request.source_language
    if source == "auto":
        detected = translate_service.detect_language(request.texts[0])
        source = detected.get("language_code", "en")
    
    result = translate_service.translate_batch(request.texts, source, request.target_language)
    return {
        "translations": result,
        "source_language": source,
        "target_language": request.target_language,
    }


@router.get("/languages")
async def get_languages():
    """Get list of supported languages"""
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in LANGUAGE_NAMES.items()
        ],
        "total": len(LANGUAGE_NAMES),
    }
