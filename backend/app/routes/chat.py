"""
Chat Routes - AI Conversation with Multi-Agent Orchestration
"""
import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from app.models.conversation import ChatRequest
from app.services.agent_orchestrator import orchestrator
from app.services.translate_service import translate_service
from app.services.dynamodb_service import db
from app.utils.auth import get_current_user
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/message")
async def send_message(request: ChatRequest, user_id: str = Depends(get_current_user)):
    """Send a chat message and get AI response"""
    
    conversation_id = request.conversation_id or generate_id()
    
    # Get user profile for context
    try:
        user_profile = db.get_user(user_id) or {}
    except Exception:
        user_profile = {}
    
    language = request.language or user_profile.get("preferred_language", "en")
    
    # Keep original message for AI (it will respond in user's language)
    # Also store English version for history indexing
    user_message = request.message
    user_message_en = user_message
    if language != "en":
        try:
            translated = translate_service.translate(user_message, language, "en")
            user_message_en = translated.get("translated_text", user_message)
        except Exception:
            user_message_en = user_message
    
    # Get conversation history
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
            for msg in messages[-10:]:
                history.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content_en", msg.get("content", ""))
                })
    except Exception as e:
        logger.warning(f"Could not load conversation history: {e}")
    
    # Get AI response via multi-agent orchestrator
    try:
        ai_result = await orchestrator.process(
            user_message=user_message,
            conversation_history=history,
            user_profile=user_profile,
            language=language,
            conversation_id=conversation_id,
        )
        # Extract message string from dict response
        if isinstance(ai_result, dict):
            ai_response_en = ai_result.get("message", str(ai_result))
            agents_used = ai_result.get("agents_used", ["conversation"])
            intent = ai_result.get("intent", "general_help")
            form_update = ai_result.get("form_update")
            research_results = ai_result.get("research_results")
        else:
            ai_response_en = str(ai_result)
            agents_used = ["conversation"]
            intent = "general_help"
            form_update = None
            research_results = None
    except Exception as e:
        # Fallback response when AI is not available
        ai_response_en = (
            "I'm CivicBridge, your AI assistant for government schemes. "
            "I can help you discover eligible schemes, understand requirements, "
            "and guide you through the application process. "
            "AI services are currently being configured. Please try again shortly."
        )
        logger.warning(f"AI service unavailable: {e}")
    
    # AI already responds in the user's language via system prompt directive
    ai_response = ai_response_en
    
    # Save conversation
    new_messages = [
        {
            "role": "user",
            "content": request.message,
            "content_en": user_message_en,
            "timestamp": now_iso()
        },
        {
            "role": "assistant",
            "content": ai_response,
            "content_en": ai_response_en,
            "timestamp": now_iso()
        }
    ]
    
    try:
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
        logger.warning(f"Could not save conversation: {e}")
    
    return {
        "conversation_id": conversation_id,
        "message": ai_response,
        "language": language,
        "intent": intent,
        "agents_used": agents_used,
        "form_update": form_update,
        "research_results": research_results,
    }


@router.get("/conversations")
async def get_conversations(user_id: str = Depends(get_current_user)):
    """Get all conversations for current user"""
    try:
        conversations = db.get_user_conversations(user_id)
    except Exception:
        conversations = []
    
    return [
        {
            "conversation_id": c["conversation_id"],
            "created_at": c.get("created_at"),
            "language": c.get("language", "en"),
            "message_count": len(c.get("messages", [])),
            "last_message": c.get("messages", [{}])[-1].get("content", "") if c.get("messages") else "",
        }
        for c in conversations
    ]


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user_id: str = Depends(get_current_user)):
    """Get a specific conversation"""
    try:
        conv = db.get_conversation(user_id, conversation_id)
    except Exception:
        conv = None
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str = Depends(get_current_user)):
    """Delete a conversation"""
    try:
        result = db.delete_conversation(user_id, conversation_id)
    except Exception:
        result = None
    
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"message": "Conversation deleted"}
