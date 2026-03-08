"""
agent_orchestrator.py
─────────────────────
Thin wrapper — only handles document agent background tasks.
All conversation is handled by Claude Haiku 4.5 in ws.py tool_use loop.
ElevenLabs has been fully removed.
"""
import logging

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    async def process_document_background(self, user_id: str, document_id: str):
        """Run document processing in background after upload."""
        try:
            from app.services.document_service import document_service
            await document_service.process_document_background(user_id, document_id)
        except Exception as e:
            logger.error(f"[Orchestrator] Doc background error: {e}")


# Singleton
orchestrator = AgentOrchestrator()



# Singleton
orchestrator = AgentOrchestrator()
