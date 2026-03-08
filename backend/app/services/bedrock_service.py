"""AWS Bedrock Service - Claude Sonnet 4.6 via Converse API

Claude Sonnet 4.6 -> Fast chat, document classification, form mapping
Claude Sonnet 4.6 -> Deep reasoning, eligibility analysis

Uses the universal Converse API (works with all Bedrock models).
"""
import json
import logging
import re
from typing import Dict, List, Optional
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)

# ============================================================
# System prompts
# ============================================================

CHAT_SYSTEM_PROMPT = """You are CivicBridge AI Assistant, helping Indian citizens discover and apply for government welfare schemes.

Your capabilities:
1. Understand user needs in any Indian language (respond in the same language)
2. Match users to eligible government schemes using web search results provided to you
3. Read and use the user's uploaded document data (Aadhaar, PAN, income certificates, etc.) to pre-fill forms and check eligibility
4. Guide document upload and verification
5. Assist with application process
6. Track application status

Key rules:
- Be empathetic and patient - many users have low digital literacy
- Use simple, clear language
- Support code-mixing (Hinglish, Tanglish, etc.)
- IMPORTANT: Answer the user's ACTUAL question first. If they ask a general question (e.g. "do you know Tamil?", "what's your name?", "how are you?"), answer it directly and naturally. Do NOT pivot to scheme recommendations unless the user is asking about schemes.
- Only suggest schemes when the user is clearly asking about welfare, scholarships, benefits, or applications.
- Never ask for sensitive info like passwords or OTPs in chat
- When unsure about eligibility, err on the side of inclusion
- When the user asks for a list of schemes, scholarships, or options, ALWAYS provide a COMPLETE numbered list with details for EACH item
- Use markdown formatting in the message field: numbered lists (1. 2. 3.), **bold** for scheme names, bullet points for details under each
- Be thorough and detailed - if the user asks for 20 scholarships, list ALL 20 with name, amount, and brief eligibility info
- If web search results are provided in the context, USE THEM to give accurate, up-to-date information
- If the user's document data is provided (Aadhaar, PAN, etc.), USE IT to auto-fill information, confirm eligibility, and avoid asking for data you already have
- Include source URLs when available so users can verify information

CRITICAL JSON RULES:
- The "message" field must contain ONLY the human-readable response text. It must NEVER include any of these words: "Intent:", "Detected Language:", "Suggested Actions:", "Suggested Schemes:", "requires_info:". Those belong in their OWN separate JSON fields.
- Do NOT repeat or summarize the JSON structure inside the message field.
- The message field is what gets shown to and spoken to the user — keep it clean.

Always respond in JSON format with these fields:
{
    "message": "Your response text to the user. Clean text only — no metadata.",
    "intent": "one of: greeting, scheme_discovery, eligibility_check, document_help, application_start, application_status, general_help",
    "detected_language": "language code (en, hi, ta, te, bn, etc.)",
    "suggested_schemes": ["scheme_name_1", "scheme_name_2"],
    "suggested_actions": [{"type": "action_type", "label": "Button label", "data": {}}],
    "requires_info": ["list of missing info needed from user"]
}"""

DOC_CLASSIFY_PROMPT = """Analyze this OCR text from an Indian government document and classify it.

Respond in JSON:
{
    "document_type": "one of: aadhaar, pan, voter_id, driving_license, passport, income_certificate, caste_certificate, domicile_certificate, birth_certificate, bank_passbook, marksheet_10th, marksheet_12th, degree_certificate, disability_certificate, ration_card, land_record, other",
    "confidence": 0.0-1.0,
    "extracted_data": {
        "name": "extracted name",
        "document_number": "extracted ID number",
        "dob": "date of birth if found",
        "address": "address if found",
        "other_fields": {}
    },
    "ai_generated_name": "PersonName_DocumentType_Year.ext",
    "reasoning": "why this classification"
}"""

ELIGIBILITY_PROMPT = """You are an expert on Indian government welfare schemes.
Check if this user is eligible for the given government scheme.

Respond in JSON:
{
    "eligible": true/false,
    "match_score": 0-100,
    "met_criteria": ["list of criteria met"],
    "unmet_criteria": ["list of criteria not met"],
    "missing_info": ["info needed to confirm eligibility"],
    "missing_documents": ["documents user still needs"],
    "recommendation": "brief recommendation text"
}"""

FORM_MAP_PROMPT = """You are a form-filling assistant for Indian government portals.
Map user data and document data to the form fields. Handle Indian name formats,
address formats, and document number formats correctly.

Respond in JSON:
{
    "field_mappings": [
        {
            "field_name": "applicant_name",
            "field_selector": "#name",
            "value": "extracted value",
            "source": "aadhaar.name or profile.name",
            "confidence": 0.95
        }
    ],
    "unmapped_fields": ["field1"],
    "needs_user_input": ["field2"]
}"""


class BedrockService:
    """AWS Bedrock AI Service - Dual Model Strategy via Converse API"""

    def __init__(self):
        self.client = aws.bedrock_runtime()
        self.chat_model = settings.BEDROCK_MODEL_ID       # Claude Sonnet 4.5 - accurate
        self.smart_model = settings.BEDROCK_MODEL_ID      # Claude Sonnet 4.5 - deep analysis

    # ============================================================
    # converse_raw — used by the voice pipeline (tool_use support)
    # Supports both boto3 SigV4 and Bearer-token API-key auth.
    # ============================================================

    def converse_raw(
        self,
        model_id: str,
        messages: list,
        system: str = "",
        tools: list = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> dict:
        """Call Bedrock Converse API and return the raw response dict.

        Messages must already be in Converse API format:
            [{"role": "user", "content": [{"text": "..."}]}, ...]

        Tool-use blocks and toolResult blocks are also accepted as-is.

        Returns the full response dict (stopReason, output.message.content, usage).
        Uses Bearer-token auth if BEDROCK_API_KEY is set, otherwise falls back
        to boto3 SigV4.
        """
        body: dict = {
            "messages": messages,
            "inferenceConfig": {
                "maxTokens": max_tokens,
                "temperature": temperature,
            },
        }
        if system:
            body["system"] = [{"text": system}]
        if tools:
            body["toolConfig"] = {"tools": tools}

        if settings.BEDROCK_API_KEY:
            # ---- Direct HTTPS with Bearer token ----
            import urllib.parse
            region = settings.BEDROCK_API_REGION
            encoded_model = urllib.parse.quote(model_id, safe="")
            url = (
                f"https://bedrock-runtime.{region}.amazonaws.com"
                f"/model/{encoded_model}/converse"
            )
            try:
                import httpx as _httpx
                resp = _httpx.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {settings.BEDROCK_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=60.0,
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"[Bedrock API-key] {e} — falling back to boto3")
                # Fall through to boto3 path

        # ---- boto3 SigV4 ----
        boto_kwargs = {"modelId": model_id, **body}
        return self.client.converse(**boto_kwargs)

    # ============================================================
    # Core invoke via Converse API (universal, works with all models)
    # ============================================================

    def _invoke(self, model_id: str, messages: list,
                system: str = "", max_tokens: int = 1024,
                temperature: float = 0.7) -> str:
        """Call any Bedrock model via Converse API. Returns raw text response."""
        # Convert messages to Converse format if needed
        converse_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content")

            if isinstance(content, str):
                converse_messages.append({"role": role, "content": [{"text": content}]})
            elif isinstance(content, list):
                # Already structured - convert from Claude format to Converse format
                converse_content = []
                for item in content:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            converse_content.append({"text": item["text"]})
                        elif item.get("type") == "image":
                            # Image support via Converse API
                            source = item.get("source", {})
                            converse_content.append({
                                "image": {
                                    "format": source.get("media_type", "image/png").split("/")[-1],
                                    "source": {"bytes": __import__("base64").b64decode(source["data"])}
                                }
                            })
                        else:
                            converse_content.append({"text": str(item)})
                    else:
                        converse_content.append({"text": str(item)})
                converse_messages.append({"role": role, "content": converse_content})
            else:
                converse_messages.append({"role": role, "content": [{"text": str(content)}]})

        try:
            kwargs = {
                "modelId": model_id,
                "messages": converse_messages,
                "inferenceConfig": {
                    "maxTokens": max_tokens,
                    "temperature": temperature,
                },
            }
            if system:
                kwargs["system"] = [{"text": system}]

            response = self.client.converse(**kwargs)
            return response["output"]["message"]["content"][0]["text"]
        except ClientError as e:
            error_str = str(e)
            if "AccessDeniedException" in error_str or "ResourceNotFoundException" in error_str:
                logger.warning(f"Bedrock model {model_id} not enabled - using fallback")
            else:
                logger.error(f"Bedrock API error: {e}")
            raise

    def _parse_json(self, text: str) -> Optional[Dict]:
        """Try to parse JSON from model response (handles markdown wrapping
        and common AI-generated malformations)."""
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        def _try_parse(s: str) -> Optional[Dict]:
            """Try parsing JSON, auto-repairing common AI mistakes."""
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                pass
            # Repair: trailing commas before } or ]
            repaired = re.sub(r',\s*([}\]])', r'\1', s)
            # Repair: missing value after colon  ("key": , → "key": null,)
            repaired = re.sub(r':\s*,', ': null,', repaired)
            repaired = re.sub(r':\s*}', ': null}', repaired)
            # Repair: single quotes → double quotes
            repaired = repaired.replace("'", '"')
            try:
                return json.loads(repaired)
            except json.JSONDecodeError:
                pass
            return None

        # Try parsing the whole thing as JSON first
        result = _try_parse(clean)
        if result:
            return result

        # Try to find a JSON block at the END of the response (model often
        # outputs formatted text first, then JSON)
        # Look for the last top-level { ... } block
        depth = 0
        json_start = -1
        json_end = -1
        for i in range(len(clean) - 1, -1, -1):
            c = clean[i]
            if c == '}':
                if depth == 0:
                    json_end = i + 1
                depth += 1
            elif c == '{':
                depth -= 1
                if depth == 0:
                    json_start = i
                    break
        if json_start >= 0 and json_end > json_start:
            result = _try_parse(clean[json_start:json_end])
            if result:
                return result
        return None

    def _clean_message_text(self, text: str) -> str:
        """Strip trailing JSON blocks and leaked metadata artifacts from model output."""
        clean = text.strip()
        # Find and remove trailing JSON object (even malformed)
        depth = 0
        json_start = -1
        json_end = -1
        for i in range(len(clean) - 1, -1, -1):
            c = clean[i]
            if c == '}':
                if depth == 0:
                    json_end = i + 1
                depth += 1
            elif c == '{':
                depth -= 1
                if depth == 0:
                    json_start = i
                    break
        if json_start > 0 and json_end > json_start:
            before = clean[:json_start].strip()
            if len(before) > 10:
                clean = before
        # Strip leaked metadata lines the model sometimes appends inside message
        clean = re.sub(r'\*{0,2}Suggested Actions:\*{0,2}\s*\[.*?\]', '', clean, flags=re.DOTALL)
        clean = re.sub(r'\*{0,2}Suggested Schemes:\*{0,2}\s*\[.*?\]', '', clean, flags=re.DOTALL)
        clean = re.sub(r'\*{0,2}Requires Info:\*{0,2}\s*\[.*?\]', '', clean, flags=re.DOTALL)
        clean = re.sub(r'\*{0,2}Intent:\*{0,2}\s*\S+', '', clean)
        clean = re.sub(r'\*{0,2}Detected Language:\*{0,2}\s*\S+', '', clean)
        # Remove raw JSON key-value fragments that model leaks without braces
        clean = re.sub(r'["\'](?:intent|detected_language|suggested_schemes|suggested_actions|requires_info)["\']\s*:\s*[^,}\]]*[,]?', '', clean, flags=re.IGNORECASE)
        # Remove any remaining raw JSON arrays/objects that slipped through
        clean = re.sub(r'\[\{"type".*?\}\]', '', clean, flags=re.DOTALL)
        # Remove orphaned braces/brackets that remain after stripping
        clean = re.sub(r'[{}\[\]]\s*$', '', clean)
        # Collapse multiple blank lines into one
        clean = re.sub(r'\n{3,}', '\n\n', clean)
        return clean.strip()

    # ============================================================
    # 0. RAW CHAT (simple prompt → text, for internal agents)
    # ============================================================

    def chat_raw(self, prompt: str, max_tokens: int = 1024,
                 temperature: float = 0.3) -> str:
        """Simple prompt → text response. Used by form agent, etc."""
        try:
            return self._invoke(
                self.chat_model,
                [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                system="You are a precise data extraction assistant. Always respond in valid JSON.",
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except Exception as e:
            logger.warning(f"chat_raw failed: {e}")
            return "{}"

    # ============================================================
    # 1. CHAT  (Llama 3 70B - fast, ~0.3s)
    # ============================================================

    def chat(self, user_message: str, conversation_history: List[Dict] = None,
             user_profile: Dict = None, language: str = "en",
             web_search_context: str = "",
             document_context: str = "",
             form_context: str = "") -> Dict:
        """Conversational AI using Llama 3 70B. Accepts web search context, user document context, and form context."""
        messages = []

        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": [{"type": "text", "text": msg["content"]}],
                })

        context = ""
        if user_profile:
            context += f"\n\n[User Profile: {json.dumps(user_profile, default=str)}]"
        if document_context:
            context += f"\n\n{document_context}"
        if web_search_context:
            context += f"\n\n[Web Search Results — use these to answer the user's question accurately:]\n{web_search_context}"
        if form_context:
            context += f"\n\n{form_context}"

        full_message = user_message + context if context else user_message
        messages.append({
            "role": "user",
            "content": [{"type": "text", "text": full_message}],
        })

        # Build language-aware system prompt
        LANG_NAMES = {
            'hi': 'Hindi', 'en': 'English', 'ta': 'Tamil', 'te': 'Telugu',
            'bn': 'Bengali', 'mr': 'Marathi', 'gu': 'Gujarati', 'kn': 'Kannada',
            'ml': 'Malayalam', 'pa': 'Punjabi', 'or': 'Odia', 'as': 'Assamese',
            'ur': 'Urdu', 'sa': 'Sanskrit', 'ne': 'Nepali', 'sd': 'Sindhi',
        }
        lang_name = LANG_NAMES.get(language, 'English')
        lang_directive = f"\n\nIMPORTANT: The user's preferred language is {lang_name} (code: {language}). You MUST write the 'message' field in {lang_name}. Do NOT respond in English unless the user's language is English."
        system_prompt = CHAT_SYSTEM_PROMPT + lang_directive

        try:
            text = self._invoke(self.chat_model, messages,
                                system=system_prompt, max_tokens=2048)
            parsed = self._parse_json(text)
            if parsed and "message" in parsed:
                # Always clean the message field — removes leaked metadata/JSON
                msg = parsed["message"]
                if msg:
                    parsed["message"] = self._clean_message_text(msg)
                return parsed
            # JSON parsing failed — strip any trailing JSON from raw text
            clean_text = self._clean_message_text(text)
            return {
                "message": clean_text,
                "intent": "general_help",
                "detected_language": language,
                "suggested_schemes": [],
                "suggested_actions": [],
                "requires_info": [],
            }
        except Exception:
            return self._fallback_chat(user_message, language)

    # ============================================================
    # 2. DOCUMENT CLASSIFICATION  (Llama 3 70B - fast)
    # ============================================================

    def classify_document(self, ocr_text: str) -> Dict:
        """Classify document type and extract structured data."""
        prompt = f"OCR Text:\n{ocr_text[:3000]}"

        try:
            text = self._invoke(self.chat_model,
                                [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                                system=DOC_CLASSIFY_PROMPT, max_tokens=1024,
                                temperature=0.2)
            parsed = self._parse_json(text)
            if parsed:
                return parsed
        except Exception as e:
            logger.error(f"Document classification error: {e}")

        return {"document_type": "other", "confidence": 0.0,
                "extracted_data": {}, "ai_generated_name": "document"}

    # ============================================================
    # 3. ELIGIBILITY CHECK  (Llama 3 70B - deep reasoning)
    # ============================================================

    def check_eligibility(self, user_profile: Dict, scheme: Dict) -> Dict:
        """Deep eligibility analysis using Llama 3 70B."""
        prompt = (
            f"User Profile:\n{json.dumps(user_profile, default=str)}\n\n"
            f"Scheme Details:\n{json.dumps(scheme, default=str)}"
        )

        try:
            text = self._invoke(self.smart_model,
                                [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                                system=ELIGIBILITY_PROMPT, max_tokens=1024,
                                temperature=0.2)
            parsed = self._parse_json(text)
            if parsed:
                return parsed
        except Exception as e:
            logger.error(f"Eligibility check error: {e}")

        return {"eligible": False, "match_score": 0,
                "recommendation": "Unable to determine eligibility. Please check manually."}

    # ============================================================
    # 4. FORM FIELD MAPPING  (Llama 3 70B - fast)
    # ============================================================

    def map_form_fields(self, form_fields: list, user_data: dict,
                        document_data: dict) -> Dict:
        """Map user/document data to portal form fields."""
        prompt = (
            f"FORM FIELDS:\n{json.dumps(form_fields)}\n\n"
            f"USER DATA:\n{json.dumps(user_data, default=str)}\n\n"
            f"DOCUMENT DATA:\n{json.dumps(document_data, default=str)}"
        )

        try:
            text = self._invoke(self.chat_model,
                                [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                                system=FORM_MAP_PROMPT, max_tokens=1024,
                                temperature=0.2)
            parsed = self._parse_json(text)
            if parsed:
                return parsed
        except Exception as e:
            logger.error(f"Form mapping error: {e}")

        return {"field_mappings": [], "unmapped_fields": form_fields,
                "needs_user_input": form_fields}

    # ============================================================
    # 5. FORM SUMMARY  (Llama 3 70B - fast)
    # ============================================================

    def generate_form_summary(self, form_data: Dict, page_name: str) -> str:
        """Generate human-readable summary of filled form data."""
        prompt = (
            f"Generate a simple, clear summary of the form data filled on this page.\n"
            f"Page: {page_name}\nData: {json.dumps(form_data, default=str)}\n\n"
            f"Write it as bullet points in simple language. Include the field name and value.\n"
            f"If there are any obvious errors or suspicious values, point them out."
        )

        try:
            return self._invoke(self.chat_model,
                                [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
                                max_tokens=512, temperature=0.3)
        except Exception as e:
            logger.error(f"Form summary error: {e}")
            return "Form data filled successfully. Please verify the screenshot."

    # ============================================================
    # 6. ANALYZE PAGE SCREENSHOT  (text-based verification)
    # ============================================================

    def analyze_screenshot(self, screenshot_base64: str, page_name: str,
                           expected_fields: dict) -> Dict:
        """Verify form was filled correctly based on expected values.
        
        Note: DeepSeek V3 is text-only. We verify by checking expected data
        rather than analyzing the screenshot image directly.
        When vision models become available, image analysis can be added.
        """
        prompt = (
            f"A government form page '{page_name}' was filled with the following values:\n"
            f"{json.dumps(expected_fields, indent=2)}\n\n"
            f"Based on these field values, verify:\n"
            f"1. Do the values look reasonable and correctly formatted?\n"
            f"2. Are there any obviously wrong or suspicious values?\n"
            f"3. Are any critical fields likely missing?\n\n"
            f"Respond JSON: {{\"filled_correctly\": true/false, \"errors\": [], "
            f"\"captcha_detected\": false, \"captcha_image_region\": null, "
            f"\"needs_otp\": false, \"summary\": \"...\"}}"
        )

        messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]

        try:
            text = self._invoke(self.chat_model, messages,
                                max_tokens=512, temperature=0.2)
            parsed = self._parse_json(text)
            if parsed:
                return parsed
        except Exception as e:
            logger.error(f"Screenshot analysis error: {e}")

        return {"filled_correctly": True, "errors": [],
                "captcha_detected": False, "needs_otp": False,
                "summary": "Could not analyze. Please verify manually."}

    # ============================================================
    # Fallback (when Bedrock is unavailable)
    # ============================================================

    def _fallback_chat(self, user_message: str, language: str) -> Dict:
        """Keyword-based fallback when Bedrock is unavailable."""
        msg = user_message.lower()

        if any(w in msg for w in ["scholarship", "education", "study", "padhai", "vidya"]):
            response = ("I can help with education scholarships! We have PM Scholarship "
                        "(Rs 36,000/year), NSP schemes, and state-specific scholarships. "
                        "Tell me your age, education level, and family income.")
            intent, schemes = "scheme_discovery", ["EDU001", "EDU002", "EDU003"]
        elif any(w in msg for w in ["health", "hospital", "medical", "ayushman", "bimar"]):
            response = ("Ayushman Bharat (PM-JAY) provides Rs 5 lakh health coverage per family. "
                        "Tell me about your family income and ration card status.")
            intent, schemes = "scheme_discovery", ["HLT001", "HLT002"]
        elif any(w in msg for w in ["pension", "old age", "widow", "vridha", "vidhwa"]):
            response = ("We have Old Age Pension (Rs 200-500/month), Widow Pension (Rs 300/month), "
                        "and PM Shram Yogi Maandhan (Rs 3,000/month after 60). "
                        "What is the applicant's age?")
            intent, schemes = "scheme_discovery", ["WLF001", "WLF002", "WLF003"]
        elif any(w in msg for w in ["kisan", "farmer", "farming", "crop", "kheti", "krishi"]):
            response = ("PM-KISAN provides Rs 6,000/year, PM Fasal Bima covers crop insurance, "
                        "and Kisan Credit Card offers loans at 4% interest. "
                        "Do you own agricultural land?")
            intent, schemes = "scheme_discovery", ["AGR001", "AGR002", "AGR003"]
        elif any(w in msg for w in ["document", "upload", "aadhaar", "pan"]):
            response = ("Upload your documents and our AI will automatically read and classify them. "
                        "Supported: Aadhaar, PAN, income certificate, marksheets, and more.")
            intent, schemes = "document_help", []
        elif any(w in msg for w in ["apply", "application", "form", "avedan"]):
            response = ("To apply, I need your age, annual family income, "
                        "category (General/OBC/SC/ST), and state. "
                        "Then I'll find matching schemes and start the application.")
            intent, schemes = "application_start", []
        elif any(w in msg for w in ["hello", "hi", "namaste", "namaskar", "hey"]):
            response = ("Namaste! Welcome to CivicBridge. I help you discover and apply for "
                        "government schemes. Ask about education, healthcare, pension, "
                        "or farming schemes!")
            intent, schemes = "greeting", []
        else:
            response = ("I'm CivicBridge AI. I can help you:\n"
                        "1. Find eligible schemes\n2. Upload documents\n"
                        "3. Apply for schemes\n4. Track applications\n\n"
                        "What would you like to do?")
            intent, schemes = "general_help", []

        return {
            "message": response,
            "intent": intent,
            "detected_language": language,
            "suggested_schemes": schemes,
            "suggested_actions": [],
            "requires_info": [],
        }


# Singleton
bedrock_service = BedrockService()
