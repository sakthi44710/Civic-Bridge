"""
agent_orchestrator.py
─────────────────────
Handles document background tasks and REST chat via Mistral Large 3 (Bedrock).
Voice conversation is handled separately in ws.py tool_use loop.
"""
import asyncio
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

_CHAT_SYSTEM = (
    "You are CivicBridge, an AI assistant helping Indian citizens discover and apply for "
    "any scheme — government welfare, private scholarships, NGO programmes, corporate initiatives. Be concise, friendly, and helpful. "
    "Respond in the same language the user writes in. "
    "If asked about a scheme, explain eligibility criteria and how to apply. "
    "If the user shares personal details, suggest matching schemes."
)


class AgentOrchestrator:
    async def process(
        self,
        user_message: str,
        conversation_history: List[Dict],
        user_profile: Dict,
        language: str,
        conversation_id: str,
        document_context: str = "",
    ) -> Dict:
        """
        Handle a REST chat turn via Mistral Large 3 (Bedrock).
        Returns a dict with message, intent, agents_used, form_update, research_results.
        """
        from app.services.bedrock_service import bedrock_service

        # Build messages list for Bedrock Converse
        messages: List[Dict] = []
        for h in conversation_history:
            role = h.get("role", "user")
            if role not in ("user", "assistant"):
                role = "user"
            messages.append({"role": role, "content": [{"text": h.get("content", "")}]})

        # Append current user turn (include doc context inline if available)
        user_content = user_message
        if document_context:
            user_content = f"{user_message}\n\n[User documents context]\n{document_context}"
        messages.append({"role": "user", "content": [{"text": user_content}]})

        system_prompt = _CHAT_SYSTEM
        if user_profile:
            name = user_profile.get("name") or user_profile.get("full_name", "")
            state = user_profile.get("state", "")
            if name or state:
                system_prompt += f"\n\nUser profile: name={name}, state={state}."

        try:
            from app.config import settings
            loop = asyncio.get_running_loop()
            _msgs_snapshot = list(messages)
            raw = await loop.run_in_executor(
                None,
                lambda: bedrock_service.converse_raw(
                    model_id=settings.BEDROCK_MODEL_ID,
                    messages=_msgs_snapshot,
                    system=system_prompt,
                    tools=None,
                    max_tokens=512,
                    temperature=0.4,
                ),
            )
            # Extract text from Converse response
            content_blocks = (
                raw.get("output", {}).get("message", {}).get("content", [])
            )
            reply_text = " ".join(
                b.get("text", "") for b in content_blocks if b.get("text")
            ).strip()
            if not reply_text:
                reply_text = "I'm here to help you with government schemes. Could you please describe what you're looking for?"
        except Exception as e:
            logger.error(f"[Orchestrator] Bedrock call failed: {e}")
            reply_text = (
                "I'm CivicBridge, your AI assistant for government schemes. "
                "I can help you discover eligible schemes, understand requirements, "
                "and guide you through the application process. "
                "Please try again in a moment."
            )

        return {
            "message": reply_text,
            "intent": "general_help",
            "agents_used": ["conversation"],
            "form_update": None,
            "research_results": None,
        }

    async def process_document_background(self, user_id: str, document_id: str):
        """Run document processing in background after upload."""
        try:
            from app.services.document_service import document_service
            await document_service.process_document_background(user_id, document_id)
        except Exception as e:
            logger.error(f"[Orchestrator] Doc background error: {e}")


# Singleton
orchestrator = AgentOrchestrator()
