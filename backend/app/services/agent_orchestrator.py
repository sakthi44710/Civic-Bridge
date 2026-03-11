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
    "If the user shares personal details, suggest matching schemes. "
    "If the user asks to update, change, or correct any of their personal details, use the update_user_data tool. "
    "If the user asks about their current profile/details, use the get_user_data tool."
)

_CHAT_TOOLS = [
    {
        "toolSpec": {
            "name": "update_user_data",
            "description": "Update a user detail everywhere — profile AND all document records. Use when user asks to change, correct, or set a personal detail.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "field_name": {"type": "string", "description": "Field to update: name, dob, gender, address, state, district, pincode, annual_income, occupation, category, aadhaar_number, pan_number, father_name, mother_name, email, phone, bank_account, ifsc_code, bank_name, education_level"},
                        "correct_value": {"type": "string", "description": "The new value"},
                    },
                    "required": ["field_name", "correct_value"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "get_user_data",
            "description": "Get the user's current profile details. Use when user asks about their stored information.",
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
]

# Maps field names to profile DB keys (same as ws.py / users.py)
_PROFILE_FIELD_MAP = {
    "name": "name", "full_name": "name", "date_of_birth": "dob", "dob": "dob",
    "gender": "gender", "state": "state", "district": "district",
    "pincode": "pincode", "address": "address",
    "annual_income": "annual_income", "income": "annual_income",
    "occupation": "occupation", "category": "category",
    "education_level": "education_level",
    "email": "email", "phone": "phone_number",
    "aadhaar_number": "aadhaar_number", "pan_number": "pan_number",
    "bank_name": "bank_name", "bank_account": "bank_account",
    "ifsc_code": "ifsc_code", "father_name": "father_name",
    "mother_name": "mother_name",
}


def _execute_chat_tool(tool_name: str, params: Dict, user_id: str) -> str:
    """Execute a chat tool synchronously and return result text."""
    from app.services.dynamodb_service import db
    from app.services.document_service import document_service

    if tool_name == "update_user_data":
        field = (params.get("field_name") or "").lower().replace(" ", "_")
        value = (params.get("correct_value") or "").strip()
        if not field or not value:
            return "Need field_name and correct_value."

        profile_key = _PROFILE_FIELD_MAP.get(field)
        if profile_key:
            if profile_key == "annual_income":
                try:
                    val = int(float(value))
                except ValueError:
                    return f"Invalid numeric value for {field}."
            else:
                val = value
            try:
                db.update_user(user_id, {profile_key: val})
            except Exception as e:
                logger.error(f"Profile update {profile_key}: {e}")
                return f"Failed to update '{field}' in profile."

        docs = document_service.get_user_documents(user_id)
        updated = 0
        for doc in docs:
            extracted = doc.get("extracted_data", {})
            if not isinstance(extracted, dict):
                continue
            changed = False
            if field in extracted:
                extracted[field] = value
                changed = True
            for k, v in extracted.items():
                if isinstance(v, dict) and field in v:
                    v[field] = value
                    changed = True
            if changed:
                db.update_document(user_id, doc["document_id"], {"extracted_data": extracted})
                updated += 1
        return f"Updated '{field}' to '{value}' in profile{f' and {updated} document(s)' if updated else ''}."

    elif tool_name == "get_user_data":
        profile = db.get_user(user_id) or {}
        fields = ["name", "dob", "gender", "state", "district", "pincode", "address",
                   "annual_income", "occupation", "category", "education_level",
                   "email", "phone_number", "aadhaar_number", "pan_number",
                   "bank_name", "bank_account", "ifsc_code"]
        _PII_FIELDS = {"aadhaar_number", "pan_number", "bank_account", "ifsc_code"}
        lines = []
        for f in fields:
            v = profile.get(f)
            if v:
                if f in _PII_FIELDS:
                    s = str(v)
                    v = s[:2] + "*" * (len(s) - 4) + s[-2:] if len(s) > 4 else "****"
                lines.append(f"{f}: {v}")
        return "\n".join(lines) if lines else "No profile details found."

    return f"Unknown tool: {tool_name}"


class AgentOrchestrator:
    async def process(
        self,
        user_message: str,
        conversation_history: List[Dict],
        user_profile: Dict,
        language: str,
        conversation_id: str,
        document_context: str = "",
        user_id: str = "",
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

            # Tool-use loop (max 5 rounds)
            for _ in range(5):
                _msgs_snapshot = list(messages)
                raw = await loop.run_in_executor(
                    None,
                    lambda: bedrock_service.converse_raw(
                        model_id=settings.BEDROCK_MODEL_ID,
                        messages=_msgs_snapshot,
                        system=system_prompt,
                        tools=_CHAT_TOOLS if user_id else None,
                        max_tokens=512,
                        temperature=0.4,
                    ),
                )

                stop_reason = raw.get("stopReason", "end_turn")
                output_content = raw.get("output", {}).get("message", {}).get("content", [])

                if stop_reason in ("end_turn", "max_tokens"):
                    reply_text = " ".join(
                        b.get("text", "") for b in output_content if b.get("text")
                    ).strip()
                    break

                if stop_reason == "tool_use" and user_id:
                    messages.append({"role": "assistant", "content": output_content})
                    tool_uses = [c["toolUse"] for c in output_content if "toolUse" in c]
                    tool_results = []
                    for tu in tool_uses:
                        result_text = await loop.run_in_executor(
                            None,
                            lambda tu=tu: _execute_chat_tool(tu["name"], tu.get("input", {}), user_id),
                        )
                        tool_results.append({
                            "toolResult": {
                                "toolUseId": tu["toolUseId"],
                                "content": [{"text": result_text}],
                            }
                        })
                    messages.append({"role": "user", "content": tool_results})
                    continue

                # Unknown stop reason
                reply_text = " ".join(
                    b.get("text", "") for b in output_content if b.get("text")
                ).strip()
                break
            else:
                reply_text = "I've processed your request."

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
