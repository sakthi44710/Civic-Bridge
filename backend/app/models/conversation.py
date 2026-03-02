"""
Conversation Models for CivicBridge AI Chat
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ConversationIntent(str, Enum):
    GREETING = "greeting"
    SCHEME_DISCOVERY = "scheme_discovery"
    ELIGIBILITY_CHECK = "eligibility_check"
    DOCUMENT_HELP = "document_help"
    APPLICATION_START = "application_start"
    APPLICATION_STATUS = "application_status"
    GENERAL_HELP = "general_help"
    UNKNOWN = "unknown"


class Message(BaseModel):
    message_id: str
    role: MessageRole
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Optional[Dict] = None


class Conversation(BaseModel):
    conversation_id: str
    user_id: str
    language: str = "en"
    current_intent: ConversationIntent = ConversationIntent.UNKNOWN
    context: Dict = {}  # Stores conversation state
    messages: List[Message] = []
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    is_active: bool = True


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    language: str = "en"


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    intent: ConversationIntent
    suggested_actions: Optional[List[Dict]] = None
    schemes: Optional[List[Dict]] = None
    requires_document: Optional[str] = None


class VoiceRequest(BaseModel):
    audio_base64: str
    language: str = "en"
    conversation_id: Optional[str] = None


class VoiceResponse(BaseModel):
    conversation_id: str
    transcribed_text: str
    response_text: str
    audio_base64: Optional[str] = None  # TTS response
