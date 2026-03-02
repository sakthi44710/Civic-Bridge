"""
Live Form Filling Agent - Watches conversation and fills forms in real-time

This agent runs alongside the voice conversation:
  1. Receives conversation transcripts from Nova Sonic (or fallback STT)
  2. Uses AI (Bedrock) to extract form-relevant data from natural conversation
  3. Drives Playwright to fill government portal forms in real-time
  4. Takes screenshots after each field fill
  5. Streams updates (screenshots + field data) back via WebSocket

Architecture:
  Nova Sonic transcript → Form Agent → AI (field extraction) → Playwright (fill) → Screenshot → WebSocket → Frontend

The agent maintains state per session:
  - Current scheme/form being filled
  - Collected field values from conversation
  - Playwright browser page
  - Progress tracking
"""
import asyncio
import base64
import json
import logging
from typing import Callable, Dict, List, Optional

from app.services.bedrock_service import bedrock_service
from app.services.dynamodb_service import db
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

# Try to import Playwright
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright not installed. Form agent will use simulation mode.")


# ============================================================
# Prompt for extracting form data from conversation
# ============================================================
FIELD_EXTRACTION_PROMPT = """You are a data extraction agent. Analyze the conversation transcript and extract any form-relevant information the user has provided.

Current form fields we need to fill:
{field_list}

Already collected data:
{collected_data}

Latest conversation exchange:
User: {user_text}
Assistant: {assistant_text}

Extract ONLY new information from the user's latest message. Return JSON:
{{
    "extracted_fields": {{
        "field_name": "value"
    }},
    "fields_to_fill_now": ["field_name1", "field_name2"],
    "confidence": 0.0-1.0,
    "needs_confirmation": false
}}

Rules:
- Only extract fields that the user has explicitly stated
- Map informal language to proper field names (e.g., "my name is Raj" → "full_name": "Raj")
- Handle Indian naming conventions, date formats (DD/MM/YYYY), addresses
- If user corrects a previous value, update it
- Return empty extracted_fields if no new form data was mentioned
- Set needs_confirmation=true if you're not confident about extracted values"""


class FormFillingSession:
    """
    Manages a live form-filling session for one user/application.

    The session:
    - Tracks all collected field data from the conversation
    - Manages a Playwright browser (or simulation)
    - Fills form fields as data is extracted from conversation
    - Sends real-time updates (screenshots, progress) via callback
    """

    def __init__(self, user_id: str, scheme_id: str,
                 application_id: str = None,
                 on_update: Callable = None):
        self.user_id = user_id
        self.scheme_id = scheme_id
        self.application_id = application_id or generate_id()
        self.on_update = on_update  # async callback for streaming updates
        self.session_id = generate_id()

        # Form state
        self.collected_fields: Dict[str, str] = {}
        self.form_config: Optional[Dict] = None
        self.required_fields: List[Dict] = []
        self.total_fields: int = 0
        self.current_page: int = 1
        self.total_pages: int = 1

        # Playwright state
        self._browser: Optional[object] = None
        self._page: Optional[object] = None
        self._pw = None
        self._running = False

        # Conversation buffer
        self._last_user_text = ""
        self._last_assistant_text = ""
        self._processing = False

    async def start(self, user_data: dict = None) -> Dict:
        """Initialize the form-filling session."""
        # Load scheme automation config
        self.form_config = self._load_scheme_config(self.scheme_id)

        if self.form_config:
            pages = self.form_config.get("pages", [])
            self.total_pages = len(pages)
            for page in pages:
                self.required_fields.extend(page.get("fields", []))
            self.total_fields = len(self.required_fields)
        else:
            # Create a generic form config for common government schemes
            self.required_fields = self._get_generic_fields()
            self.total_fields = len(self.required_fields)

        # Pre-fill from user profile
        if user_data:
            self._prefill_from_profile(user_data)

        # Launch Playwright browser
        await self._launch_browser()

        self._running = True

        # Send initial update
        initial_update = self._build_update("started")
        if self.on_update:
            await self.on_update(initial_update)

        logger.info(f"Form session started: {self.session_id}, scheme={self.scheme_id}, "
                    f"fields={self.total_fields}, prefilled={len(self.collected_fields)}")

        return initial_update

    async def on_conversation_text(self, role: str, text: str):
        """
        Called when new conversation text arrives from Nova Sonic.
        Extracts form-relevant data and fills fields.
        """
        if not self._running or not text.strip():
            return

        if role == "user":
            self._last_user_text = text
        elif role == "assistant":
            self._last_assistant_text = text

        # Only process when we have both user and assistant text
        # (or just user text for immediate extraction)
        if role == "user" and not self._processing:
            self._processing = True
            try:
                await self._extract_and_fill(text, self._last_assistant_text)
            finally:
                self._processing = False

    async def _extract_and_fill(self, user_text: str, assistant_text: str):
        """Extract field data from conversation and fill the form."""
        if not user_text:
            return

        # Build field list for extraction prompt
        field_list = "\n".join([
            f"- {f.get('field_name', f.get('name', 'unknown'))}: {f.get('description', f.get('label', ''))}"
            for f in self.required_fields
        ])

        collected_summary = json.dumps(self.collected_fields, indent=2, ensure_ascii=False)

        # Use AI to extract form data from conversation
        try:
            extraction = bedrock_service.chat_raw(
                FIELD_EXTRACTION_PROMPT.format(
                    field_list=field_list,
                    collected_data=collected_summary,
                    user_text=user_text,
                    assistant_text=assistant_text or "(not yet responded)",
                )
            )

            if isinstance(extraction, str):
                # Try to parse JSON from the response
                try:
                    extraction = json.loads(extraction)
                except json.JSONDecodeError:
                    # Try to find JSON in the response
                    start = extraction.find("{")
                    end = extraction.rfind("}") + 1
                    if start >= 0 and end > start:
                        extraction = json.loads(extraction[start:end])
                    else:
                        logger.warning(f"Could not parse extraction result: {extraction[:100]}")
                        return

            extracted_fields = extraction.get("extracted_fields", {})
            fields_to_fill = extraction.get("fields_to_fill_now", [])
            confidence = extraction.get("confidence", 0)

            if not extracted_fields:
                return

            # Update collected fields
            new_fields_filled = []
            for field_name, value in extracted_fields.items():
                if value and str(value).strip():
                    old_value = self.collected_fields.get(field_name)
                    self.collected_fields[field_name] = str(value).strip()
                    if old_value != str(value).strip():
                        new_fields_filled.append(field_name)

            if not new_fields_filled:
                return

            logger.info(f"Form agent extracted {len(new_fields_filled)} new fields: {new_fields_filled}")

            # Fill form fields via Playwright
            screenshot_b64 = await self._fill_fields_in_browser(new_fields_filled)

            # Send update to frontend
            update = self._build_update(
                status="filling",
                screenshot=screenshot_b64,
                newly_filled=new_fields_filled,
            )

            if self.on_update:
                await self.on_update(update)

            # Save to DynamoDB
            self._save_progress()

        except Exception as e:
            logger.warning(f"Field extraction error: {e}")

    async def _fill_fields_in_browser(self, field_names: List[str]) -> str:
        """Fill specific fields in the Playwright browser and take a screenshot."""
        screenshot_b64 = ""

        if self._page and PLAYWRIGHT_AVAILABLE:
            try:
                for field_name in field_names:
                    value = self.collected_fields.get(field_name, "")
                    if not value:
                        continue

                    # Find the field config
                    field_config = next(
                        (f for f in self.required_fields
                         if f.get("field_name") == field_name or f.get("name") == field_name),
                        None
                    )

                    if field_config and field_config.get("selector"):
                        selector = field_config["selector"]
                        field_type = field_config.get("type", "text")

                        try:
                            if field_type == "text":
                                await self._page.fill(selector, value)
                            elif field_type == "select":
                                await self._page.select_option(selector, value=value)
                            elif field_type == "radio":
                                await self._page.click(f"{selector}[value='{value}']")
                            elif field_type == "checkbox":
                                if value.lower() in ("true", "yes", "1"):
                                    await self._page.check(selector)
                            elif field_type == "date":
                                await self._page.fill(selector, value)

                            # Small delay for visual effect
                            await self._page.wait_for_timeout(300)
                        except Exception as e:
                            logger.warning(f"Could not fill {field_name}: {e}")

                # Take screenshot
                screenshot_bytes = await self._page.screenshot(full_page=False, type="png")
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

            except Exception as e:
                logger.warning(f"Playwright fill error: {e}")

        elif not PLAYWRIGHT_AVAILABLE:
            # Simulation mode — generate a visual representation
            screenshot_b64 = self._generate_simulation_screenshot(field_names)

        return screenshot_b64

    async def _launch_browser(self):
        """Launch headless Chromium for form filling."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.info(f"[SIMULATION] Form agent running in simulation mode")
            return

        try:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ]
            )

            context = await self._browser.new_context(
                viewport={"width": 1280, "height": 900},
                locale="en-IN",
                timezone_id="Asia/Kolkata",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            )

            self._page = await context.new_page()

            # Navigate to the form URL if available
            if self.form_config and self.form_config.get("pages"):
                first_page = self.form_config["pages"][0]
                url = first_page.get("url")
                if url:
                    await self._page.goto(url, wait_until="networkidle", timeout=30000)
                    await self._page.wait_for_timeout(2000)
                    logger.info(f"Navigated to form: {url}")

        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")
            self._page = None

    async def close(self):
        """Close the browser and clean up."""
        self._running = False
        try:
            if self._page:
                await self._page.close()
            if self._browser:
                await self._browser.close()
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass

        # Final save
        self._save_progress()
        logger.info(f"Form session closed: {self.session_id}")

    def _build_update(self, status: str, screenshot: str = "",
                      newly_filled: list = None) -> Dict:
        """Build a form update event for the frontend."""
        filled_fields_display = {}
        for fname in (newly_filled or []):
            filled_fields_display[fname] = self.collected_fields.get(fname, "")

        return {
            "type": "form_update",
            "data": {
                "session_id": self.session_id,
                "application_id": self.application_id,
                "scheme_id": self.scheme_id,
                "status": status,
                "current_page": self.current_page,
                "total_pages": self.total_pages,
                "fields_filled": len(self.collected_fields),
                "total_fields": self.total_fields,
                "filled_fields": self.collected_fields,
                "newly_filled": newly_filled or [],
                "screenshot_base64": screenshot,
                "page_name": self._get_current_page_name(),
                "timestamp": now_iso(),
            }
        }

    def _get_current_page_name(self) -> str:
        """Get the name of the current form page."""
        if self.form_config and self.form_config.get("pages"):
            pages = self.form_config["pages"]
            if self.current_page <= len(pages):
                return pages[self.current_page - 1].get("name", f"Page {self.current_page}")
        return "Application Form"

    def _save_progress(self):
        """Save form progress to DynamoDB."""
        try:
            db.update_application(self.user_id, self.application_id, {
                "form_data": self.collected_fields,
                "fields_filled": len(self.collected_fields),
                "total_fields": self.total_fields,
                "current_page": self.current_page,
                "automation_status": "live_filling",
                "updated_at": now_iso(),
            })
        except Exception as e:
            logger.warning(f"Could not save form progress: {e}")

    def _load_scheme_config(self, scheme_id: str) -> Optional[Dict]:
        """Load automation config for a scheme."""
        try:
            scheme = db.get_scheme(scheme_id)
            if scheme:
                config = scheme.get("automation_config")
                if config:
                    if isinstance(config, str):
                        config = json.loads(config)
                    return config
        except Exception:
            pass
        return None

    def _prefill_from_profile(self, profile: dict):
        """Pre-fill form fields from user profile."""
        mapping = {
            "full_name": profile.get("name", ""),
            "name": profile.get("name", ""),
            "applicant_name": profile.get("name", ""),
            "email": profile.get("email", ""),
            "email_id": profile.get("email", ""),
            "mobile_number": profile.get("phone_number", ""),
            "phone_number": profile.get("phone_number", ""),
            "date_of_birth": profile.get("dob", ""),
            "dob": profile.get("dob", ""),
            "gender": profile.get("gender", ""),
            "category": profile.get("category", ""),
            "caste_category": profile.get("category", ""),
            "state": profile.get("state", ""),
            "district": profile.get("district", ""),
            "pincode": profile.get("pincode", ""),
            "address": profile.get("address", ""),
            "aadhaar_number": profile.get("aadhaar_number", ""),
        }
        for field_name, value in mapping.items():
            if value and any(
                f.get("field_name") == field_name or f.get("name") == field_name
                for f in self.required_fields
            ):
                self.collected_fields[field_name] = str(value)

    def _get_generic_fields(self) -> list:
        """Return generic Indian government form fields."""
        return [
            {"field_name": "full_name", "label": "Full Name", "type": "text", "description": "Applicant full name as per Aadhaar"},
            {"field_name": "father_name", "label": "Father/Guardian Name", "type": "text", "description": "Parent or guardian name"},
            {"field_name": "date_of_birth", "label": "Date of Birth", "type": "date", "description": "DD/MM/YYYY"},
            {"field_name": "gender", "label": "Gender", "type": "select", "description": "Male/Female/Other"},
            {"field_name": "category", "label": "Category", "type": "select", "description": "SC/ST/OBC/General"},
            {"field_name": "aadhaar_number", "label": "Aadhaar Number", "type": "text", "description": "12-digit Aadhaar number"},
            {"field_name": "mobile_number", "label": "Mobile Number", "type": "text", "description": "10-digit mobile number"},
            {"field_name": "email", "label": "Email", "type": "text", "description": "Email address"},
            {"field_name": "state", "label": "State", "type": "select", "description": "State of residence"},
            {"field_name": "district", "label": "District", "type": "text", "description": "District"},
            {"field_name": "pincode", "label": "PIN Code", "type": "text", "description": "6-digit PIN code"},
            {"field_name": "address", "label": "Address", "type": "text", "description": "Full postal address"},
            {"field_name": "bank_name", "label": "Bank Name", "type": "text", "description": "Name of the bank"},
            {"field_name": "account_number", "label": "Bank Account Number", "type": "text", "description": "Bank account number"},
            {"field_name": "ifsc_code", "label": "IFSC Code", "type": "text", "description": "Bank IFSC code"},
            {"field_name": "annual_income", "label": "Annual Family Income", "type": "text", "description": "In INR"},
            {"field_name": "occupation", "label": "Occupation", "type": "text", "description": "Current occupation"},
            {"field_name": "education", "label": "Education Level", "type": "select", "description": "Highest qualification"},
        ]

    def _generate_simulation_screenshot(self, field_names: list) -> str:
        """Generate a text-based simulation when Playwright is not available.
        Returns empty string — the frontend uses the field data instead."""
        return ""


class FormAgentService:
    """
    Manages form-filling sessions across users.
    
    Each active voice conversation can have one associated form session.
    The form agent listens to conversation transcripts and fills forms
    seamlessly in the background.
    """

    def __init__(self):
        self._sessions: Dict[str, FormFillingSession] = {}

    async def start_session(self, user_id: str, scheme_id: str,
                            application_id: str = None,
                            user_data: dict = None,
                            on_update: Callable = None) -> FormFillingSession:
        """Start a new form-filling session."""
        session = FormFillingSession(
            user_id=user_id,
            scheme_id=scheme_id,
            application_id=application_id,
            on_update=on_update,
        )

        await session.start(user_data)
        self._sessions[session.session_id] = session

        return session

    def get_session(self, session_id: str) -> Optional[FormFillingSession]:
        """Get an active session."""
        return self._sessions.get(session_id)

    async def stop_session(self, session_id: str):
        """Stop and clean up a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            await session.close()

    async def stop_all(self):
        """Stop all active sessions."""
        for sid in list(self._sessions.keys()):
            await self.stop_session(sid)


# Singleton
form_agent_service = FormAgentService()
