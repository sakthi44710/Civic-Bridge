"""
Multi-Agent Orchestrator - Coordinates Specialized AI Agents

Architecture:
  ┌──────────────────┐
  │   Orchestrator   │  ← User message + context
  └────────┬─────────┘
           │ Instant response (Conversation Agent only)
           │
     ┌─────┴──────┐
     ▼            ▼ (background, fire-and-forget)
  Convo      ┌────┴────────┬──────────────┐
  Agent      ▼             ▼              ▼
(Llama3-70B) Research     Form          Document
 INSTANT     Agent        Agent          Agent
            (Llama3-70B) (Automation)  (Classify+OCR)

The Conversation Agent returns INSTANTLY. Research/Form agents run in the
background and push results via the next interaction or a separate channel.
This ensures voice replies in <1s with zero blocking.
"""
import asyncio
import json
import logging
from typing import Dict, List, Optional
from app.services.bedrock_service import bedrock_service
from app.services.dynamodb_service import db
from app.services.web_search_service import web_search_service
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

# Try importing automation service (may fail if playwright isn't installed)
try:
    from app.services.automation_service import automation_service
    AUTOMATION_AVAILABLE = True
except Exception:
    AUTOMATION_AVAILABLE = False
    logger.info("Automation service not available - form agent will use simulation")

# Store for background task results (keyed by conversation_id)
_background_results: Dict[str, Dict] = {}


class AgentOrchestrator:
    """
    Multi-agent orchestrator optimized for instant voice response.
    
    The Conversation Agent runs synchronously and returns immediately.
    Research and Form agents are dispatched as fire-and-forget background
    tasks — they NEVER block the voice reply.
    """

    def __init__(self):
        self.bedrock = bedrock_service

    # ================================================================
    # Main Entry Point — returns INSTANTLY from conversation agent
    # ================================================================

    async def process(
        self,
        user_message: str,
        conversation_history: List[Dict] = None,
        user_profile: Dict = None,
        language: str = "en",
        conversation_id: str = None,
    ) -> Dict:
        """
        Process user message. Searches the web for relevant schemes/scholarships
        when it detects a discovery intent, then passes search results to the
        conversation agent for an informed response.
        """
        agents_used = ["conversation"]

        # ── Detect if web search is needed ─────────────────────────
        search_context = ""
        search_category = self._detect_search_intent(user_message)
        if search_category:
            agents_used.append("web_search")
            try:
                # Build user context from profile for targeted search
                user_ctx = ""
                if user_profile:
                    parts = []
                    if user_profile.get("category"):
                        parts.append(user_profile["category"])
                    if user_profile.get("state"):
                        parts.append(user_profile["state"])
                    if user_profile.get("education"):
                        parts.append(user_profile["education"])
                    user_ctx = " ".join(parts)

                search_data = await web_search_service.search_scholarships(
                    user_context=user_ctx,
                    category=search_category,
                    count=25,
                )
                search_context = web_search_service.format_results_for_ai(search_data)
                logger.info(f"Web search: {search_data.get('total_results', 0)} results for '{search_category}'")
            except Exception as e:
                logger.warning(f"Web search failed: {e}")

        # ── Agent 1: Conversation Agent (with search context) ──────
        convo_result = self._run_conversation_agent(
            user_message, conversation_history, user_profile, language,
            web_search_context=search_context,
        )

        intent = convo_result.get("intent", "general_help")
        suggested_schemes = convo_result.get("suggested_schemes", [])
        message = convo_result.get("message", "")

        # ── Check for any pending background results from previous turn ──
        pending_research = None
        pending_form = None
        if conversation_id and conversation_id in _background_results:
            pending = _background_results.pop(conversation_id)
            pending_research = pending.get("research_results")
            pending_form = pending.get("form_update")
            if pending_research:
                agents_used.append("research")
            if pending_form:
                agents_used.append("form")

        # ── Fire background agents (non-blocking) ─────────────────
        if intent == "application_start" and suggested_schemes and AUTOMATION_AVAILABLE:
            asyncio.ensure_future(
                self._background_form(conversation_id, user_profile or {}, suggested_schemes[0])
            )

        # ── Return immediately ─────────────────────────────────────
        response = {
            "message": message,
            "intent": intent,
            "agents_used": agents_used,
            "detected_language": convo_result.get("detected_language", language),
            "suggested_schemes": suggested_schemes,
            "suggested_actions": convo_result.get("suggested_actions", []),
            "requires_info": convo_result.get("requires_info", []),
            "research_results": pending_research,
            "form_update": pending_form,
        }

        logger.info(
            f"Orchestrator: intent={intent}, agents={agents_used}, "
            f"schemes={len(suggested_schemes)} [instant return]"
        )

        return response

    # ================================================================
    # Intent detection for web search
    # ================================================================

    def _detect_search_intent(self, message: str) -> Optional[str]:
        """
        Detect if the user's message requires a web search.
        Returns the search category or None.
        """
        msg = message.lower()

        # Scholarship / education
        if any(w in msg for w in [
            "scholarship", "scholarships", "education scheme",
            "study", "padhai", "vidya", "student", "college",
            "nsp", "merit", "post-matric", "pre-matric",
            "list", "top", "best", "all", "how many",
        ]):
            return "scholarship"

        # Healthcare
        if any(w in msg for w in [
            "health", "hospital", "medical", "ayushman",
            "bimar", "treatment", "insurance", "doctor",
        ]):
            return "healthcare"

        # Pension
        if any(w in msg for w in [
            "pension", "old age", "widow", "vridha",
            "vidhwa", "retirement", "shram yogi",
        ]):
            return "pension"

        # Agriculture
        if any(w in msg for w in [
            "kisan", "farmer", "farming", "crop", "kheti",
            "krishi", "agriculture", "pm-kisan",
        ]):
            return "agriculture"

        # Housing
        if any(w in msg for w in [
            "house", "housing", "awas", "home", "ghar",
            "construction", "flat",
        ]):
            return "housing"

        # General scheme discovery
        if any(w in msg for w in [
            "scheme", "yojana", "government", "sarkari",
            "benefit", "subsidy", "welfare", "apply",
            "eligible", "eligibility",
        ]):
            return "general"

        return None

    # ================================================================
    # Agent 1: Conversation Agent (Llama 3 70B - INSTANT)
    # ================================================================

    def _run_conversation_agent(
        self,
        user_message: str,
        conversation_history: List[Dict],
        user_profile: Dict,
        language: str,
        web_search_context: str = "",
    ) -> Dict:
        """
        Primary conversational agent. Uses Llama 3 70B.
        Passes web search results as context for informed responses.
        """
        return self.bedrock.chat(
            user_message=user_message,
            conversation_history=conversation_history,
            user_profile=user_profile,
            language=language,
            web_search_context=web_search_context,
        )

    # ================================================================
    # Background: Research Agent (fire-and-forget)
    # ================================================================

    async def _background_research(
        self, conversation_id: str, user_profile: Dict, scheme_names: List[str]
    ):
        """
        Runs research agent in background using web search.
        Searches for details about specific schemes.
        """
        try:
            results = []
            for scheme_name in scheme_names[:5]:
                try:
                    search_data = await web_search_service.search_scheme_details(scheme_name)
                    if search_data.get("results"):
                        results.append({
                            "scheme_name": scheme_name,
                            "details": search_data["results"][:3],
                        })
                except Exception as e:
                    logger.warning(f"Research agent error for {scheme_name}: {e}")

            research_data = {
                "schemes_analyzed": len(results),
                "results": results,
            }

            if conversation_id:
                _background_results.setdefault(conversation_id, {})
                _background_results[conversation_id]["research_results"] = research_data

            logger.info(f"Background research complete: {len(results)} schemes analyzed")
        except Exception as e:
            logger.warning(f"Background research failed: {e}")

    # ================================================================
    # Background: Form Agent (fire-and-forget)
    # ================================================================

    async def _background_form(
        self, conversation_id: str, user_profile: Dict, scheme_id: str
    ):
        """
        Runs form agent in background. Stores results for next turn.
        """
        if not AUTOMATION_AVAILABLE:
            return

        try:
            user_id = user_profile.get("user_id", "")
            documents = []
            if user_id:
                try:
                    docs = db.get_user_documents(user_id)
                    documents = docs if isinstance(docs, list) else []
                except Exception:
                    pass

            result = await automation_service.start_session(
                scheme_id=scheme_id,
                user_data=user_profile,
                document_data={d.get("document_type", ""): d for d in documents},
            )

            form_data = {
                "status": "started",
                "application_id": result.get("application_id"),
                "screenshot": result.get("screenshot_base64"),
                "page_name": result.get("current_page", ""),
                "fields_filled": result.get("fields_filled", 0),
                "total_fields": result.get("total_fields", 0),
            }

            if conversation_id:
                _background_results.setdefault(conversation_id, {})
                _background_results[conversation_id]["form_update"] = form_data

            logger.info(f"Background form agent complete: {form_data.get('status')}")
        except Exception as e:
            logger.warning(f"Background form agent failed: {e}")

    # ================================================================
    # Agent 4: Document Agent (Classification & Extraction)
    # ================================================================

    def run_document_agent(self, ocr_text: str) -> Dict:
        """
        Document processing agent. Classifies documents and extracts
        structured data using AI.
        Uses Llama 3 70B for fast classification.
        """
        return self.bedrock.classify_document(ocr_text)


# Singleton
orchestrator = AgentOrchestrator()
