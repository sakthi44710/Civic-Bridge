"""
Voice Routes - Ultra-fast Voice-First Interaction

Pipeline optimized for minimum latency:
  Audio → STT (parallel with profile fetch) → Conversation Agent (instant) → TTS → Audio

Background tasks (non-blocking):
  - Translation to English for history
  - Conversation save to DynamoDB
  - Research/Form agents via orchestrator

Target: <800ms from silence detection to first audio byte.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from app.services.transcribe_service import transcribe_service
from app.services.polly_service import polly_service
from app.services.agent_orchestrator import orchestrator
from app.services.translate_service import translate_service
from app.services.dynamodb_service import db
from app.utils.auth import get_current_user
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["Voice"])


def _save_conversation_sync(
    user_id, conversation_id, conv, user_text, user_text_en,
    ai_response, ai_response_en, language
):
    """Background: save conversation to DynamoDB (non-blocking)."""
    try:
        new_messages = [
            {
                "role": "user",
                "content": user_text,
                "content_en": user_text_en,
                "timestamp": now_iso(),
                "input_type": "voice"
            },
            {
                "role": "assistant",
                "content": ai_response,
                "content_en": ai_response_en,
                "timestamp": now_iso()
            }
        ]
        if conv:
            existing_msgs = conv.get("messages", [])
            if isinstance(existing_msgs, str):
                try:
                    existing_msgs = json.loads(existing_msgs)
                except (json.JSONDecodeError, TypeError):
                    existing_msgs = []
            existing_msgs.extend(new_messages)
            db.update_conversation(user_id, conversation_id, {
                "messages": existing_msgs,
                "language": language,
            })
        else:
            db.save_conversation({
                "user_id": user_id,
                "conversation_id": conversation_id,
                "messages": new_messages,
                "language": language,
                "created_at": now_iso(),
            })
    except Exception as e:
        logger.warning(f"Background save failed: {e}")


@router.post("/process")
async def process_voice(
    audio: UploadFile = File(...),
    language: str = Form("hi"),
    conversation_id: str = Form(None),
    user_id: str = Depends(get_current_user)
):
    """Ultra-fast voice processing: STT → AI → TTS (all else is background)"""
    
    # Read audio file
    audio_content = await audio.read()
    if not audio_content:
        raise HTTPException(status_code=400, detail="Empty audio file")
    
    # Determine audio format
    format_map = {
        "audio/wav": "wav", "audio/wave": "wav",
        "audio/webm": "webm", "audio/ogg": "ogg",
        "audio/mp3": "mp3", "audio/mpeg": "mp3",
        "audio/mp4": "mp4", "audio/flac": "flac",
    }
    audio_format = format_map.get(audio.content_type, "wav")
    
    # ── PARALLEL: STT + Profile fetch ─────────────────────────────
    # Run STT and profile fetch concurrently
    loop = asyncio.get_event_loop()
    
    stt_future = loop.run_in_executor(
        None, transcribe_service.transcribe_audio, audio_content, language, audio_format
    )
    
    profile_future = loop.run_in_executor(
        None, lambda: db.get_user(user_id) or {}
    )
    
    conversation_id = conversation_id or generate_id()
    
    # Load conversation history (lightweight)
    history = []
    conv = None
    try:
        conv = db.get_conversation(user_id, conversation_id)
        if conv and conv.get("messages"):
            messages = conv["messages"]
            if isinstance(messages, str):
                try:
                    messages = json.loads(messages)
                except (json.JSONDecodeError, TypeError):
                    messages = []
            for msg in messages[-6:]:
                history.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content_en", msg.get("content", ""))
                })
    except Exception:
        pass
    
    # Wait for STT + profile
    try:
        stt_result = await stt_future
        user_text = stt_result.get("text", "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech recognition failed: {str(e)}")
    
    if not user_text:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")
    
    try:
        user_profile = await profile_future
    except Exception:
        user_profile = {}
    
    # ── INSTANT: Conversation Agent only (no research/form blocking) ──
    try:
        ai_result = await orchestrator.process(
            user_message=user_text,
            conversation_history=history,
            user_profile=user_profile,
            language=language,
            conversation_id=conversation_id,
        )
        if isinstance(ai_result, dict):
            ai_response = ai_result.get("message", str(ai_result))
            agents_used = ai_result.get("agents_used", ["conversation"])
            intent = ai_result.get("intent", "general_help")
            form_update = ai_result.get("form_update")
            research_results = ai_result.get("research_results")
        else:
            ai_response = str(ai_result)
            agents_used = ["conversation"]
            intent = "general_help"
            form_update = None
            research_results = None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")
    
    # ── TTS (critical path — must be inline) ──────────────────────
    try:
        tts_result = polly_service.synthesize(ai_response, language)
        audio_base64 = tts_result.get("audio_base64", "")
    except Exception:
        audio_base64 = ""
    
    # ── BACKGROUND: Translation + Save (fire-and-forget) ──────────
    # Don't block the response — translate and save asynchronously
    async def _bg_translate_and_save():
        user_text_en = user_text
        ai_response_en = ai_response
        if language != "en":
            try:
                translated = translate_service.translate(user_text, language, "en")
                user_text_en = translated.get("translated_text", user_text)
            except Exception:
                pass
        _save_conversation_sync(
            user_id, conversation_id, conv, user_text, user_text_en,
            ai_response, ai_response_en, language
        )
    
    asyncio.ensure_future(_bg_translate_and_save())
    
    # ── RETURN IMMEDIATELY ────────────────────────────────────────
    return {
        "conversation_id": conversation_id,
        "user_text": user_text,
        "response_text": ai_response,
        "audio_base64": audio_base64,
        "language": language,
        "intent": intent,
        "agents_used": agents_used,
        "form_update": form_update,
        "research_results": research_results,
    }


@router.post("/synthesize")
async def synthesize_speech(
    text: str = Form(...),
    language: str = Form("hi"),
    user_id: str = Depends(get_current_user)
):
    """Convert text to speech"""
    try:
        result = polly_service.synthesize(text, language)
        return {
            "audio_base64": result.get("audio_base64", ""),
            "content_type": result.get("content_type", "audio/mp3"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
