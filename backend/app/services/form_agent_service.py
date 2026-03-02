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
import os
from pathlib import Path
from typing import Callable, Dict, List, Optional

from app.services.bedrock_service import bedrock_service
from app.services.dynamodb_service import db
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

# Path to local form template (used when no external URL is configured)
_FORM_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "static" / "form_template.html"

# Try to import Playwright
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright not installed. Form agent will use simulation mode. "
                   "Run: pip install playwright && python -m playwright install chromium")

# ─── Common selectors for Indian govt portals ──────────────────────────
OTP_SELECTORS = [
    'input[name*="otp" i]', 'input[id*="otp" i]',
    'input[placeholder*="OTP"]', 'input[placeholder*="otp" i]',
    '#otp', '#txtOtp', '#OTPInput', '#otpInput',
    'input[maxlength="6"][type="text"]', 'input[maxlength="6"][type="number"]',
    'input[maxlength="4"][type="text"]',
    '.otp-input', '.otp input',
]

CAPTCHA_SELECTORS = [
    'input[name*="captcha" i]', 'input[id*="captcha" i]',
    'input[placeholder*="captcha" i]', 'input[placeholder*="Captcha"]',
    '#captcha', '#txtCaptcha', '#captchaText', '#captchaInput', '.captcha-input',
    'input[name*="security" i]', 'input[id*="security_code" i]',
]

CAPTCHA_IMG_SELECTORS = [
    'img[id*="captcha" i]', 'img[src*="captcha" i]',
    'img[alt*="captcha" i]', '#captchaImage', '#imgCaptcha',
    '.captcha img', '.captcha-img', 'img[class*="captcha" i]',
]

VERIFY_BTN_SELECTORS = [
    'button:text-is("Verify OTP")', 'button:text-is("Verify")',
    'button:text-is("Submit OTP")', 'button:text-is("Validate")',
    'input[value*="Verify" i]', 'input[value*="Submit" i]',
    '#btnVerify', '#verifyOTP', '.verify-btn',
]


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

        # OTP / CAPTCHA gating
        self.waiting_for: Optional[str] = None   # None | 'otp' | 'captcha'
        self._otp_selector: Optional[str] = None
        self._captcha_selector: Optional[str] = None

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

        # Take initial screenshot to show the empty form
        initial_screenshot = ""
        if self._page and PLAYWRIGHT_AVAILABLE:
            try:
                screenshot_bytes = await self._page.screenshot(full_page=False, type="png")
                initial_screenshot = base64.b64encode(screenshot_bytes).decode("utf-8")
            except Exception:
                pass

        # If we pre-filled fields from profile, fill them in the browser too
        if self.collected_fields and self._page and PLAYWRIGHT_AVAILABLE:
            initial_screenshot = await self._fill_fields_in_browser(
                list(self.collected_fields.keys())
            ) or initial_screenshot

        # Send initial update
        initial_update = self._build_update("started", screenshot=initial_screenshot)
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
            # If browser is waiting for OTP/CAPTCHA input, skip conversation extraction
            if self.waiting_for:
                logger.info(f"[FormAgent] Skipping extraction — waiting for {self.waiting_for}")
                return
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

            # After filling, check if page now requires OTP / CAPTCHA
            interaction = await self._detect_page_interactions()
            if interaction["needs_captcha"]:
                self.waiting_for = "captcha"
                self._captcha_selector = interaction["captcha_selector"]
                update = self._build_update(
                    status="waiting_captcha",
                    screenshot=screenshot_b64,
                    newly_filled=new_fields_filled,
                    extra={"captcha_image_base64": interaction["captcha_image_base64"]},
                )
            elif interaction["needs_otp"]:
                self.waiting_for = "otp"
                self._otp_selector = interaction["otp_selector"]
                update = self._build_update(
                    status="waiting_otp",
                    screenshot=screenshot_b64,
                    newly_filled=new_fields_filled,
                )
            else:
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

    async def submit_otp(self, otp: str) -> Dict:
        """Called when the user provides the OTP. Types it into the live browser page."""
        self.waiting_for = None
        screenshot_b64 = ""

        if self._page and PLAYWRIGHT_AVAILABLE:
            try:
                selector = self._otp_selector
                # Find the first visible OTP field if we don't have a cached selector
                if not selector:
                    for sel in OTP_SELECTORS:
                        elem = await self._page.query_selector(sel)
                        if elem and await elem.is_visible():
                            selector = sel
                            break

                if selector:
                    await self._page.fill(selector, str(otp).strip())
                    await self._page.wait_for_timeout(300)

                    # Try clicking a Verify / Submit OTP button
                    for btn_sel in VERIFY_BTN_SELECTORS:
                        try:
                            await self._page.click(btn_sel, timeout=1500)
                            break
                        except Exception:
                            pass

                    await self._page.wait_for_timeout(2000)  # wait for redirect

                screenshot_bytes = await self._page.screenshot(full_page=False, type="png")
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

                # Check again — maybe we triggered another page needing CAPTCHA
                interaction = await self._detect_page_interactions()
                if interaction["needs_captcha"]:
                    self.waiting_for = "captcha"
                    self._captcha_selector = interaction["captcha_selector"]
                    update = self._build_update("waiting_captcha", screenshot=screenshot_b64,
                                                extra={"captcha_image_base64": interaction["captcha_image_base64"]})
                else:
                    update = self._build_update("otp_submitted", screenshot=screenshot_b64)
            except Exception as e:
                logger.warning(f"OTP submit error: {e}")
                update = self._build_update("otp_error", screenshot=screenshot_b64)
        else:
            update = self._build_update("otp_submitted", screenshot="")

        if self.on_update:
            await self.on_update(update)
        self._save_progress()
        return update

    async def submit_captcha(self, captcha_text: str) -> Dict:
        """Called when the user provides the CAPTCHA answer. Types it into the live browser page."""
        self.waiting_for = None
        screenshot_b64 = ""

        if self._page and PLAYWRIGHT_AVAILABLE:
            try:
                selector = self._captcha_selector
                if not selector:
                    for sel in CAPTCHA_SELECTORS:
                        elem = await self._page.query_selector(sel)
                        if elem and await elem.is_visible():
                            selector = sel
                            break

                if selector:
                    await self._page.fill(selector, captcha_text.strip())
                    await self._page.wait_for_timeout(300)

                screenshot_bytes = await self._page.screenshot(full_page=False, type="png")
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

                # Check if OTP field appeared after CAPTCHA
                interaction = await self._detect_page_interactions()
                if interaction["needs_otp"]:
                    self.waiting_for = "otp"
                    self._otp_selector = interaction["otp_selector"]
                    update = self._build_update("waiting_otp", screenshot=screenshot_b64)
                else:
                    update = self._build_update("captcha_submitted", screenshot=screenshot_b64)
            except Exception as e:
                logger.warning(f"CAPTCHA submit error: {e}")
                update = self._build_update("captcha_error", screenshot=screenshot_b64)
        else:
            update = self._build_update("captcha_submitted", screenshot="")

        if self.on_update:
            await self.on_update(update)
        self._save_progress()
        return update

    async def _detect_page_interactions(self) -> Dict:
        """Scan the current Playwright page for OTP / CAPTCHA fields."""
        result = {
            "needs_otp": False, "otp_selector": None,
            "needs_captcha": False, "captcha_selector": None,
            "captcha_image_base64": "",
        }
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return result
        try:
            # Detect OTP fields
            for sel in OTP_SELECTORS:
                try:
                    elem = await self._page.query_selector(sel)
                    if elem and await elem.is_visible():
                        result["needs_otp"] = True
                        result["otp_selector"] = sel
                        break
                except Exception:
                    pass

            # Detect CAPTCHA fields
            for sel in CAPTCHA_SELECTORS:
                try:
                    elem = await self._page.query_selector(sel)
                    if elem and await elem.is_visible():
                        result["needs_captcha"] = True
                        result["captcha_selector"] = sel
                        break
                except Exception:
                    pass

            # If CAPTCHA detected, grab the CAPTCHA image for the user
            if result["needs_captcha"]:
                for img_sel in CAPTCHA_IMG_SELECTORS:
                    try:
                        img_elem = await self._page.query_selector(img_sel)
                        if img_elem and await img_elem.is_visible():
                            img_bytes = await img_elem.screenshot()
                            result["captcha_image_base64"] = base64.b64encode(img_bytes).decode("utf-8")
                            break
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"Page interaction detection error: {e}")
        return result

    async def _fill_fields_in_browser(self, field_names: List[str]) -> str:
        """Fill specific fields in the Playwright browser and take a screenshot."""
        screenshot_b64 = ""

        if self._page and PLAYWRIGHT_AVAILABLE:
            try:
                last_selector = None
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
                        last_selector = selector

                        try:
                            # Scroll element into view first
                            await self._page.evaluate(
                                "(sel) => document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'})",
                                selector,
                            )
                            await self._page.wait_for_timeout(200)

                            if field_type == "select":
                                # Try matching by value, then by label
                                try:
                                    await self._page.select_option(selector, value=value)
                                except Exception:
                                    try:
                                        await self._page.select_option(selector, label=value)
                                    except Exception as e2:
                                        logger.warning(f"Select option failed for {field_name}: {e2}")
                            elif field_type == "radio":
                                await self._page.click(f"{selector}[value='{value}']")
                            elif field_type == "checkbox":
                                if value.lower() in ("true", "yes", "1"):
                                    await self._page.check(selector)
                            else:
                                # text, date, textarea — all use fill()
                                await self._page.fill(selector, value)

                            # Small delay for visual effect
                            await self._page.wait_for_timeout(300)
                        except Exception as e:
                            logger.warning(f"Could not fill {field_name}: {e}")

                # Take screenshot (scroll to last field for context)
                if last_selector:
                    try:
                        await self._page.evaluate(
                            "(sel) => document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'})",
                            last_selector,
                        )
                        await self._page.wait_for_timeout(300)
                    except Exception:
                        pass

                screenshot_bytes = await self._page.screenshot(full_page=False, type="png")
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

            except Exception as e:
                logger.warning(f"Playwright fill error: {e}")

        elif not PLAYWRIGHT_AVAILABLE:
            # Simulation mode — generate a visual representation
            screenshot_b64 = self._generate_simulation_screenshot(field_names)

        return screenshot_b64

    async def _launch_browser(self):
        """Launch headless Chromium for form filling.
        Navigates to the scheme portal URL when available, otherwise
        loads the built-in form template so fields can be filled + screenshotted."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.info("[SIMULATION] Form agent running in simulation mode")
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
            navigated = False
            if self.form_config and self.form_config.get("pages"):
                first_page = self.form_config["pages"][0]
                url = first_page.get("url")
                if url:
                    try:
                        await self._page.goto(url, wait_until="networkidle", timeout=30000)
                        await self._page.wait_for_timeout(2000)
                        navigated = True
                        logger.info(f"Navigated to form: {url}")
                    except Exception as e:
                        logger.warning(f"Failed to navigate to {url}: {e}")

            # Fallback: load the built-in form template
            if not navigated:
                template_path = _FORM_TEMPLATE_PATH
                if template_path.exists():
                    file_url = template_path.as_uri()        # file:///...
                    await self._page.goto(file_url, wait_until="load", timeout=10000)
                    # Set scheme title in the template
                    try:
                        scheme_name = self.scheme_id.replace("_", " ").replace("-", " ").title()
                        await self._page.evaluate(
                            """(name) => {
                                document.getElementById('scheme-title').textContent = name + ' Application';
                                document.getElementById('breadcrumb-scheme').textContent = name;
                            }""",
                            scheme_name,
                        )
                    except Exception:
                        pass
                    logger.info("Loaded built-in form template")
                else:
                    logger.warning(f"Form template not found at {template_path}")

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
                      newly_filled: list = None, extra: dict = None) -> Dict:
        """Build a form update event for the frontend."""
        data = {
            "session_id": self.session_id,
            "application_id": self.application_id,
            "scheme_id": self.scheme_id,
            "status": status,
            "waiting_for": self.waiting_for,   # 'otp' | 'captcha' | None
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
        if extra:
            data.update(extra)
        return {"type": "form_update", "data": data}

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
        """Return generic Indian government form fields with CSS selectors
        matching the built-in form_template.html."""
        return [
            {"field_name": "full_name", "label": "Full Name", "type": "text",
             "selector": "#full_name", "description": "Applicant full name as per Aadhaar"},
            {"field_name": "father_name", "label": "Father/Guardian Name", "type": "text",
             "selector": "#father_name", "description": "Parent or guardian name"},
            {"field_name": "date_of_birth", "label": "Date of Birth", "type": "text",
             "selector": "#date_of_birth", "description": "DD/MM/YYYY"},
            {"field_name": "gender", "label": "Gender", "type": "select",
             "selector": "#gender", "description": "Male/Female/Other"},
            {"field_name": "category", "label": "Category", "type": "select",
             "selector": "#category", "description": "SC/ST/OBC/General"},
            {"field_name": "aadhaar_number", "label": "Aadhaar Number", "type": "text",
             "selector": "#aadhaar_number", "description": "12-digit Aadhaar number"},
            {"field_name": "mobile_number", "label": "Mobile Number", "type": "text",
             "selector": "#mobile_number", "description": "10-digit mobile number"},
            {"field_name": "email", "label": "Email", "type": "text",
             "selector": "#email", "description": "Email address"},
            {"field_name": "state", "label": "State", "type": "select",
             "selector": "#state", "description": "State of residence"},
            {"field_name": "district", "label": "District", "type": "text",
             "selector": "#district", "description": "District"},
            {"field_name": "pincode", "label": "PIN Code", "type": "text",
             "selector": "#pincode", "description": "6-digit PIN code"},
            {"field_name": "address", "label": "Address", "type": "text",
             "selector": "#address", "description": "Full postal address"},
            {"field_name": "bank_name", "label": "Bank Name", "type": "text",
             "selector": "#bank_name", "description": "Name of the bank"},
            {"field_name": "account_number", "label": "Bank Account Number", "type": "text",
             "selector": "#account_number", "description": "Bank account number"},
            {"field_name": "ifsc_code", "label": "IFSC Code", "type": "text",
             "selector": "#ifsc_code", "description": "Bank IFSC code"},
            {"field_name": "annual_income", "label": "Annual Family Income", "type": "text",
             "selector": "#annual_income", "description": "In INR"},
            {"field_name": "occupation", "label": "Occupation", "type": "text",
             "selector": "#occupation", "description": "Current occupation"},
            {"field_name": "education", "label": "Education Level", "type": "select",
             "selector": "#education", "description": "Highest qualification"},
        ]

    def _generate_simulation_screenshot(self, field_names: list) -> str:
        """Generate a text-based simulation when Playwright is not available.
        Returns empty string — the frontend uses the field data instead."""
        return ""


class FormAgentService:
    """
    Manages form-filling sessions across users.

    Session isolation: each user_id maps to exactly ONE active browser session.
    Calling start_session() a second time for the same user kills the old browser
    and starts a fresh one — no cross-user access is possible.
    """

    def __init__(self):
        # session_id  → FormFillingSession
        self._sessions: Dict[str, FormFillingSession] = {}
        # user_id     → session_id  (enforces one browser per user)
        self._user_sessions: Dict[str, str] = {}

    async def start_session(self, user_id: str, scheme_id: str,
                            application_id: str = None,
                            user_data: dict = None,
                            on_update: Callable = None) -> FormFillingSession:
        """Start a new isolated form-filling session for this user.
        Automatically tears down any previous session for the same user."""
        # Tear down previous session for this user (browser isolation)
        old_sid = self._user_sessions.get(user_id)
        if old_sid and old_sid in self._sessions:
            logger.info(f"[FormAgent] Replacing existing session {old_sid} for user {user_id}")
            await self.stop_session(old_sid)

        session = FormFillingSession(
            user_id=user_id,
            scheme_id=scheme_id,
            application_id=application_id,
            on_update=on_update,
        )
        await session.start(user_data)

        self._sessions[session.session_id] = session
        self._user_sessions[user_id] = session.session_id  # one session per user

        logger.info(f"[FormAgent] Session {session.session_id} started for user {user_id}, scheme={scheme_id}")
        return session

    def get_session(self, session_id: str) -> Optional[FormFillingSession]:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    def get_session_by_user(self, user_id: str) -> Optional[FormFillingSession]:
        """Get the active session for a user (returns None if no active session)."""
        sid = self._user_sessions.get(user_id)
        return self._sessions.get(sid) if sid else None

    async def stop_session(self, session_id: str):
        """Stop and clean up a session."""
        session = self._sessions.pop(session_id, None)
        if session:
            # Remove from user → session mapping
            self._user_sessions = {
                uid: sid for uid, sid in self._user_sessions.items()
                if sid != session_id
            }
            await session.close()

    async def stop_all(self):
        """Stop all active sessions."""
        for sid in list(self._sessions.keys()):
            await self.stop_session(sid)


# Singleton
form_agent_service = FormAgentService()
