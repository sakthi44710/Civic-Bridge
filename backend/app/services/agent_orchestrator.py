"""
agent_orchestrator.py -- Tool dispatcher for ElevenLabs backend subagent

Role: Backend subagent (Claude Sonnet 4.6 on Bedrock).
  - Routes ElevenLabs tool_call messages to the correct service
  - Returns plain string results for ElevenLabs to speak

ElevenLabs main agent (Claude Haiku 4.5) owns ALL conversation intelligence.
This module does NOT generate AI responses or do TTS.
"""
import logging
from typing import Dict

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """
    Thin dispatcher: routes tool names to backend services.
    All tool dispatch actually happens in ws.py _dispatch_tool().
    This class is kept for any future service-layer orchestration.
    """

    def run_document_agent(self, ocr_text: str) -> Dict:
        """
        Document processing agent. Classifies documents and extracts
        structured data using AI (Claude Sonnet 4.6 on Bedrock).
        """
        from app.services.bedrock_service import bedrock_service
        return bedrock_service.classify_document(ocr_text)


# Singleton
orchestrator = AgentOrchestrator()
