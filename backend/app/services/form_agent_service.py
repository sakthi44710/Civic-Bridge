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
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, Dict, List, Optional

from app.services.bedrock_service import bedrock_service
from app.services.dynamodb_service import db
from app.services.page_analyzer import page_analyzer
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

# Path to local form template (used when no external URL is configured)
_FORM_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "static" / "form_template.html"

# Single-threaded executor for Playwright — sync API runs here so we bypass
# the asyncio event loop's lack of subprocess support on Windows.
_pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pw")

# Try to import Playwright (sync API — works on any event loop)
try:
    from playwright.sync_api import sync_playwright
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
        self._on_real_portal = False  # True when browsing a real govt website
        self._page_fields_cache: List[Dict] = []  # AI-discovered fields on current page

        # OTP / CAPTCHA gating
        self.waiting_for: Optional[str] = None   # None | 'otp' | 'captcha'
        self._otp_selector: Optional[str] = None
        self._captcha_selector: Optional[str] = None

        # Conversation buffer
        self._last_user_text = ""
        self._last_assistant_text = ""
        self._processing = False
        self._extract_task: Optional[asyncio.Task] = None  # background extraction
        self._screenshot_task: Optional[asyncio.Task] = None  # periodic screenshot

    async def start(self, user_data: dict = None) -> Dict:
        """Initialize the form-filling session."""
        # Load scheme automation config (may contain portal_url)
        self.form_config = self._load_scheme_config(self.scheme_id)

        # Launch Playwright browser — tries real portal first, falls back to template
        await self._launch_browser()

        self._running = True

        # Discover fields from the live page using AI (for real portals)
        # or use hardcoded fields for the local template
        if self._on_real_portal and self._page:
            await self._discover_page_fields()
        elif self.form_config:
            pages = self.form_config.get("pages", [])
            self.total_pages = len(pages)
            for page_cfg in pages:
                self.required_fields.extend(page_cfg.get("fields", []))
            self.total_fields = len(self.required_fields)
        else:
            self.required_fields = self._get_generic_fields()
            self.total_fields = len(self.required_fields)

        # Pre-fill from user profile AFTER required_fields is populated
        if user_data:
            self._prefill_from_profile(user_data)

        # Take initial screenshot
        initial_screenshot = await self._take_screenshot()

        # If we pre-filled fields from profile, fill them in the browser
        if self.collected_fields and self._page and PLAYWRIGHT_AVAILABLE:
            initial_screenshot = await self._fill_fields_in_browser(
                list(self.collected_fields.keys())
            ) or initial_screenshot

        # Send initial update
        initial_update = self._build_update("started", screenshot=initial_screenshot)
        if self.on_update:
            await self.on_update(initial_update)

        # Start periodic screenshot refresh (every 3 s) for live projection
        self._screenshot_task = asyncio.ensure_future(self._periodic_screenshot())

        logger.info(f"Form session started: {self.session_id}, scheme={self.scheme_id}, "
                    f"real_portal={self._on_real_portal}, "
                    f"fields={self.total_fields}, prefilled={len(self.collected_fields)}")

        return initial_update

    async def _take_screenshot(self) -> str:
        """Take a JPEG screenshot of the current page. Returns base64 string.
        Dispatches sync Playwright call to the dedicated thread."""
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return ""
        try:
            def _sync():
                shot = self._page.screenshot(full_page=False, type="jpeg", quality=80)
                return base64.b64encode(shot).decode("utf-8")
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(_pw_executor, _sync)
        except Exception:
            return ""

    async def _periodic_screenshot(self, interval: float = 3.0):
        """Send a fresh browser screenshot every `interval` seconds so the
        frontend shows a truly live view, even between field fills."""
        try:
            while self._running:
                await asyncio.sleep(interval)
                if not self._running or not self._page or not PLAYWRIGHT_AVAILABLE:
                    break
                try:
                    b64 = await self._take_screenshot()
                    if b64 and self.on_update:
                        await self.on_update({
                            "type": "form_update",
                            "data": {
                                "session_id": self.session_id,
                                "status": self.waiting_for or "filling",
                                "screenshot_base64": b64,
                                "screenshot_format": "jpeg",
                                "fields_filled": len(self.collected_fields),
                                "total_fields": self.total_fields,
                                "filled_fields": self.collected_fields,
                                "newly_filled": [],
                                "timestamp": now_iso(),
                            }
                        })
                except Exception:
                    pass  # page may have closed
        except asyncio.CancelledError:
            pass

    async def _discover_page_fields(self):
        """Use AI page analyzer to discover form fields on the current page.
        Called on real portals where we don't know the selectors in advance."""
        if not self._page:
            return

        def _sync_discover():
            try:
                analysis = page_analyzer.analyze_page(self._page)
                if analysis.get("fields"):
                    self._page_fields_cache = analysis["fields"]
                    for field in analysis["fields"]:
                        field_name = field.get("field_name", "")
                        if field_name and not any(
                            f.get("field_name") == field_name for f in self.required_fields
                        ):
                            self.required_fields.append({
                                "field_name": field_name,
                                "label": field.get("label", field_name),
                                "type": field.get("type", "text"),
                                "selector": field.get("selector", ""),
                                "description": field.get("label", ""),
                            })
                    self.total_fields = len(self.required_fields)
                    logger.info(f"Discovered {len(analysis['fields'])} fields on real portal")

                    if analysis.get("has_otp"):
                        self.waiting_for = "otp"
                    if analysis.get("has_captcha"):
                        self.waiting_for = "captcha"
                    if analysis.get("login_required"):
                        logger.info("Portal requires login — will attempt registration flow")
            except Exception as e:
                logger.warning(f"Page field discovery failed: {e}")

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(_pw_executor, _sync_discover)
        except Exception as e:
            logger.warning(f"Discover fields executor error: {e}")

    async def on_conversation_text(self, role: str, text: str):
        """
        Called when new conversation text arrives (user or assistant).
        Kicks off background extraction so the voice pipeline is never blocked.
        """
        if not self._running or not text.strip():
            return

        if role == "user":
            self._last_user_text = text
        elif role == "assistant":
            self._last_assistant_text = text

        # Trigger extraction on BOTH user and assistant messages
        # — user text contains raw data, assistant text confirms/asks for fields.
        if self.waiting_for:
            logger.info(f"[FormAgent] Skipping extraction — waiting for {self.waiting_for}")
            return

        if self._processing:
            return  # previous extraction still running — will catch up on next message

        # Run extraction in background so it never blocks the voice response
        self._extract_task = asyncio.ensure_future(self._bg_extract())

    async def _bg_extract(self):
        """Background wrapper for extract_and_fill — never blocks the caller."""
        self._processing = True
        try:
            await self._extract_and_fill(self._last_user_text, self._last_assistant_text)
        except Exception as e:
            logger.warning(f"Background extraction error: {e}")
        finally:
            self._processing = False

    async def _extract_and_fill(self, user_text: str, assistant_text: str):
        """Extract field data from conversation and fill the form.
        Two-stage process:
          Stage 1: AI extracts data from conversation → collected_fields
          Stage 2: Map collected data to actual page selectors → fill browser
        """
        if not user_text:
            return

        # ── Stage 1: Extract data from conversation ──────────────
        field_list = "\n".join([
            f"- {f.get('field_name', f.get('name', 'unknown'))}: {f.get('description', f.get('label', ''))}"
            for f in self.required_fields
        ])
        collected_summary = json.dumps(self.collected_fields, indent=2, ensure_ascii=False)

        try:
            loop = asyncio.get_event_loop()
            extraction = await loop.run_in_executor(
                None,
                lambda: bedrock_service.chat_raw(
                    FIELD_EXTRACTION_PROMPT.format(
                        field_list=field_list,
                        collected_data=collected_summary,
                        user_text=user_text,
                        assistant_text=assistant_text or "(not yet responded)",
                    )
                )
            )

            if isinstance(extraction, str):
                try:
                    extraction = json.loads(extraction)
                except json.JSONDecodeError:
                    start = extraction.find("{")
                    end = extraction.rfind("}") + 1
                    if start >= 0 and end > start:
                        extraction = json.loads(extraction[start:end])
                    else:
                        return

            extracted_fields = extraction.get("extracted_fields", {})
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

        except Exception as e:
            logger.warning(f"Field extraction error: {e}")
            return

        # ── Stage 2: Fill fields in the browser ──────────────────
        try:
            if self._on_real_portal and self._page:
                # AI-driven: map collected data to real page selectors
                screenshot_b64 = await self._fill_real_portal(new_fields_filled)
            else:
                # Local template: use hardcoded selectors
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

            self._save_progress()

        except Exception as e:
            logger.warning(f"Field fill error: {e}")

    async def _fill_real_portal(self, new_fields: List[str]) -> str:
        """Fill fields on a real government portal using AI-discovered selectors.
        Uses page_analyzer to map collected data to actual page selectors.
        Runs on Playwright executor thread."""
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return ""

        def _sync_fill_real():
            try:
                # Re-discover page fields if cache is empty (page may have changed)
                if not self._page_fields_cache:
                    try:
                        analysis = page_analyzer.analyze_page(self._page)
                        if analysis.get("fields"):
                            self._page_fields_cache = analysis["fields"]
                            for field in analysis["fields"]:
                                field_name = field.get("field_name", "")
                                if field_name and not any(
                                    f.get("field_name") == field_name for f in self.required_fields
                                ):
                                    self.required_fields.append({
                                        "field_name": field_name,
                                        "label": field.get("label", field_name),
                                        "type": field.get("type", "text"),
                                        "selector": field.get("selector", ""),
                                        "description": field.get("label", ""),
                                    })
                            self.total_fields = len(self.required_fields)
                    except Exception:
                        pass

                # Map collected data to page selectors via AI
                mapping = page_analyzer.map_data_to_fields(
                    self.collected_fields, self._page_fields_cache
                )

                filled_count = 0
                for m in mapping.get("mappings", []):
                    selector = m.get("selector", "")
                    value = m.get("value", "")
                    field_type = m.get("type", "text")
                    if not selector or not value:
                        continue

                    try:
                        # Scroll into view
                        self._page.evaluate(
                            "(sel) => document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'})",
                            selector,
                        )
                        self._page.wait_for_timeout(200)

                        if field_type == "select":
                            try:
                                self._page.select_option(selector, value=value)
                            except Exception:
                                try:
                                    self._page.select_option(selector, label=value)
                                except Exception:
                                    pass
                        elif field_type == "radio":
                            self._page.click(f"{selector}[value='{value}']")
                        elif field_type == "checkbox":
                            if value.lower() in ("true", "yes", "1"):
                                self._page.check(selector)
                        else:
                            self._page.fill(selector, value)

                        self._page.wait_for_timeout(300)
                        filled_count += 1
                    except Exception as e:
                        logger.debug(f"Could not fill {selector}: {e}")

                logger.info(f"Real portal: filled {filled_count} fields via AI mapping")

                # Check if we should click Next/Submit after filling
                if filled_count > 0:
                    self._sync_try_navigate_next()

            except Exception as e:
                logger.warning(f"Real portal fill error: {e}")

            # Take screenshot
            try:
                shot = self._page.screenshot(full_page=False, type="jpeg", quality=80)
                return base64.b64encode(shot).decode("utf-8")
            except Exception:
                return ""

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(_pw_executor, _sync_fill_real)
        except Exception:
            return ""

    def _sync_try_navigate_next(self):
        """Sync version of navigate-next — called from within executor thread."""
        if not self._page:
            return
        try:
            btn_selector = page_analyzer.find_next_button(self._page)
            if btn_selector:
                try:
                    btn_text = self._page.text_content(btn_selector)
                    btn_text_lower = (btn_text or "").strip().lower()
                    if btn_text_lower in ("next", "continue", "proceed", "आगे",
                                          "next step", "save & next", "save and next"):
                        self._page.click(btn_selector)
                        self._page.wait_for_timeout(3000)
                        self._page_fields_cache = []
                        try:
                            analysis = page_analyzer.analyze_page(self._page)
                            if analysis.get("fields"):
                                self._page_fields_cache = analysis["fields"]
                        except Exception:
                            pass
                        self.current_page += 1
                        logger.info(f"Navigated to page {self.current_page}")
                except Exception:
                    pass
        except Exception as e:
            logger.debug(f"Next button navigation: {e}")

    async def _try_navigate_next(self):
        """After filling fields, check if there's a Submit/Next button to click.
        Only clicks if all visible required fields are filled."""
        if not self._page:
            return
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(_pw_executor, self._sync_try_navigate_next)
        except Exception as e:
            logger.debug(f"Navigate next executor error: {e}")

    async def submit_otp(self, otp: str) -> Dict:
        """Called when the user provides the OTP. Types it into the live browser page."""
        self.waiting_for = None
        screenshot_b64 = ""

        if self._page and PLAYWRIGHT_AVAILABLE:
            def _sync_otp():
                nonlocal screenshot_b64
                try:
                    selector = self._otp_selector
                    if not selector:
                        for sel in OTP_SELECTORS:
                            elem = self._page.query_selector(sel)
                            if elem and elem.is_visible():
                                selector = sel
                                break

                    if selector:
                        self._page.fill(selector, str(otp).strip())
                        self._page.wait_for_timeout(300)

                        for btn_sel in VERIFY_BTN_SELECTORS:
                            try:
                                self._page.click(btn_sel, timeout=1500)
                                break
                            except Exception:
                                pass

                        self._page.wait_for_timeout(2000)

                    try:
                        shot = self._page.screenshot(full_page=False, type="jpeg", quality=80)
                        screenshot_b64 = base64.b64encode(shot).decode("utf-8")
                    except Exception:
                        pass

                    # Check for CAPTCHA after OTP
                    interaction = self._sync_detect_page_interactions()
                    return interaction
                except Exception as e:
                    logger.warning(f"OTP submit error: {e}")
                    return None

            try:
                loop = asyncio.get_event_loop()
                interaction = await loop.run_in_executor(_pw_executor, _sync_otp)
                if interaction and interaction.get("needs_captcha"):
                    self.waiting_for = "captcha"
                    self._captcha_selector = interaction["captcha_selector"]
                    update = self._build_update("waiting_captcha", screenshot=screenshot_b64,
                                                extra={"captcha_image_base64": interaction["captcha_image_base64"]})
                else:
                    update = self._build_update("otp_submitted", screenshot=screenshot_b64)
            except Exception as e:
                logger.warning(f"OTP executor error: {e}")
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
            def _sync_captcha():
                nonlocal screenshot_b64
                try:
                    selector = self._captcha_selector
                    if not selector:
                        for sel in CAPTCHA_SELECTORS:
                            elem = self._page.query_selector(sel)
                            if elem and elem.is_visible():
                                selector = sel
                                break

                    if selector:
                        self._page.fill(selector, captcha_text.strip())
                        self._page.wait_for_timeout(300)

                    try:
                        shot = self._page.screenshot(full_page=False, type="jpeg", quality=80)
                        screenshot_b64 = base64.b64encode(shot).decode("utf-8")
                    except Exception:
                        pass

                    interaction = self._sync_detect_page_interactions()
                    return interaction
                except Exception as e:
                    logger.warning(f"CAPTCHA submit error: {e}")
                    return None

            try:
                loop = asyncio.get_event_loop()
                interaction = await loop.run_in_executor(_pw_executor, _sync_captcha)
                if interaction and interaction.get("needs_otp"):
                    self.waiting_for = "otp"
                    self._otp_selector = interaction["otp_selector"]
                    update = self._build_update("waiting_otp", screenshot=screenshot_b64)
                else:
                    update = self._build_update("captcha_submitted", screenshot=screenshot_b64)
            except Exception as e:
                logger.warning(f"CAPTCHA executor error: {e}")
                update = self._build_update("captcha_error", screenshot=screenshot_b64)
        else:
            update = self._build_update("captcha_submitted", screenshot="")

        if self.on_update:
            await self.on_update(update)
        self._save_progress()
        return update

    def _sync_detect_page_interactions(self) -> Dict:
        """Sync version: Scan the current Playwright page for OTP / CAPTCHA fields.
        Called from within the Playwright executor thread."""
        result = {
            "needs_otp": False, "otp_selector": None,
            "needs_captcha": False, "captcha_selector": None,
            "captcha_image_base64": "",
        }
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return result
        try:
            for sel in OTP_SELECTORS:
                try:
                    elem = self._page.query_selector(sel)
                    if elem and elem.is_visible():
                        result["needs_otp"] = True
                        result["otp_selector"] = sel
                        break
                except Exception:
                    pass

            for sel in CAPTCHA_SELECTORS:
                try:
                    elem = self._page.query_selector(sel)
                    if elem and elem.is_visible():
                        result["needs_captcha"] = True
                        result["captcha_selector"] = sel
                        break
                except Exception:
                    pass

            if result["needs_captcha"]:
                for img_sel in CAPTCHA_IMG_SELECTORS:
                    try:
                        img_elem = self._page.query_selector(img_sel)
                        if img_elem and img_elem.is_visible():
                            img_bytes = img_elem.screenshot()
                            result["captcha_image_base64"] = base64.b64encode(img_bytes).decode("utf-8")
                            break
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"Page interaction detection error: {e}")
        return result

    async def _detect_page_interactions(self) -> Dict:
        """Async wrapper — dispatches sync detection to Playwright thread."""
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return {
                "needs_otp": False, "otp_selector": None,
                "needs_captcha": False, "captcha_selector": None,
                "captcha_image_base64": "",
            }
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(_pw_executor, self._sync_detect_page_interactions)
        except Exception:
            return {
                "needs_otp": False, "otp_selector": None,
                "needs_captcha": False, "captcha_selector": None,
                "captcha_image_base64": "",
            }

    async def _fill_fields_in_browser(self, field_names: List[str]) -> str:
        """Fill specific fields in the Playwright browser (local template mode)
        and take a screenshot. Dispatches sync Playwright calls to executor."""
        if not self._page or not PLAYWRIGHT_AVAILABLE:
            return self._generate_simulation_screenshot(field_names)

        def _sync_fill():
            try:
                last_selector = None
                for field_name in field_names:
                    value = self.collected_fields.get(field_name, "")
                    if not value:
                        continue

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
                            self._page.evaluate(
                                "(sel) => document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'})",
                                selector,
                            )
                            self._page.wait_for_timeout(200)

                            if field_type == "select":
                                try:
                                    self._page.select_option(selector, value=value)
                                except Exception:
                                    try:
                                        self._page.select_option(selector, label=value)
                                    except Exception as e2:
                                        logger.warning(f"Select option failed for {field_name}: {e2}")
                            elif field_type == "radio":
                                self._page.click(f"{selector}[value='{value}']")
                            elif field_type == "checkbox":
                                if value.lower() in ("true", "yes", "1"):
                                    self._page.check(selector)
                            else:
                                self._page.fill(selector, value)

                            self._page.wait_for_timeout(300)
                        except Exception as e:
                            logger.warning(f"Could not fill {field_name}: {e}")

                # Scroll to last filled field for context
                if last_selector:
                    try:
                        self._page.evaluate(
                            "(sel) => document.querySelector(sel)?.scrollIntoView({behavior:'smooth',block:'center'})",
                            last_selector,
                        )
                        self._page.wait_for_timeout(300)
                    except Exception:
                        pass

            except Exception as e:
                logger.warning(f"Playwright fill error: {e}")

            # Take screenshot
            try:
                shot = self._page.screenshot(full_page=False, type="jpeg", quality=80)
                return base64.b64encode(shot).decode("utf-8")
            except Exception:
                return ""

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(_pw_executor, _sync_fill)
        except Exception:
            return ""

    def _resolve_portal_url(self) -> Optional[str]:
        """Resolve the portal URL for the current scheme.
        Checks form_config first, then tries to find the scheme in seed data."""
        # 1. From automation_config pages
        if self.form_config and self.form_config.get("pages"):
            url = self.form_config["pages"][0].get("url")
            if url:
                return url

        # 2. From scheme portal_url
        if self.form_config and self.form_config.get("portal_url"):
            return self.form_config["portal_url"]

        # 3. Try loading the full scheme record from DynamoDB
        try:
            scheme = db.get_scheme(self.scheme_id)
            if scheme and scheme.get("portal_url"):
                return scheme["portal_url"]
        except Exception:
            pass

        # 4. Try fuzzy matching scheme by name across seed data
        try:
            import glob
            data_dir = Path(__file__).resolve().parent.parent.parent / "data"
            search_name = self.scheme_id.replace("_", " ").replace("-", " ").lower()
            for json_file in data_dir.glob("schemes_*.json"):
                with open(json_file, "r", encoding="utf-8") as f:
                    schemes = json.load(f)
                for s in schemes:
                    name = s.get("name", "").lower()
                    sid = s.get("scheme_id", "").lower()
                    if (search_name in name or search_name in sid
                            or sid in search_name or name in search_name):
                        url = s.get("portal_url")
                        if url:
                            # Also load automation_config for field hints
                            if s.get("automation_config") and not self.form_config:
                                self.form_config = s["automation_config"]
                            return url
        except Exception as e:
            logger.debug(f"Seed data URL resolution failed: {e}")

        return None

    async def _launch_browser(self):
        """Launch headless Chromium for form filling.
        Uses Playwright SYNC API on a dedicated thread so we don't need
        ProactorEventLoop (avoids Windows subprocess issue).
        Strategy: try navigating to the real portal first.
        If that fails (timeout, blocked, error), fall back to the local template."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.info("[SIMULATION] Form agent running in simulation mode")
            return

        def _sync_launch():
            try:
                self._pw = sync_playwright().start()
                self._browser = self._pw.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ]
                )

                # Landscape viewport for better readability in the left panel
                context = self._browser.new_context(
                    viewport={"width": 1366, "height": 768},
                    locale="en-IN",
                    timezone_id="Asia/Kolkata",
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"
                    ),
                )

                self._page = context.new_page()

                # ── Try real portal first ────────────────────────────
                portal_url = self._resolve_portal_url()
                if portal_url:
                    try:
                        logger.info(f"Attempting real portal: {portal_url}")
                        resp = self._page.goto(
                            portal_url, wait_until="domcontentloaded", timeout=20000
                        )
                        self._page.wait_for_timeout(2000)

                        # Check if we actually got a usable page
                        if resp and resp.ok:
                            self._on_real_portal = True
                            logger.info(f"✓ Real portal loaded: {portal_url}")
                            return
                        else:
                            logger.warning(f"Portal returned status {resp.status if resp else 'None'}, falling back")
                    except Exception as e:
                        logger.warning(f"Real portal failed ({portal_url}): {e}")

                # ── Fallback: local template ─────────────────────────
                self._on_real_portal = False
                template_path = _FORM_TEMPLATE_PATH
                if template_path.exists():
                    file_url = template_path.as_uri()
                    self._page.goto(file_url, wait_until="load", timeout=10000)
                    try:
                        scheme_name = self.scheme_id.replace("_", " ").replace("-", " ").title()
                        self._page.evaluate(
                            """(name) => {
                                document.getElementById('scheme-title').textContent = name + ' Application';
                                document.getElementById('breadcrumb-scheme').textContent = name;
                            }""",
                            scheme_name,
                        )
                    except Exception:
                        pass
                    logger.info("Loaded built-in form template (fallback)")
                else:
                    logger.warning(f"Form template not found at {template_path}")

            except Exception as e:
                logger.error(f"Failed to launch browser: {e}")
                self._page = None

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(_pw_executor, _sync_launch)
        except Exception as e:
            logger.error(f"Playwright thread error: {e}")
            self._page = None

    async def close(self):
        """Close the browser and clean up."""
        self._running = False
        # Cancel background tasks
        for task in (self._extract_task, self._screenshot_task):
            if task and not task.done():
                task.cancel()

        def _sync_close():
            try:
                if self._page:
                    self._page.close()
                if self._browser:
                    self._browser.close()
                if self._pw:
                    self._pw.stop()
            except Exception:
                pass

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(_pw_executor, _sync_close)
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
            "screenshot_format": "jpeg",
            "real_portal": self._on_real_portal,
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

    def get_missing_fields(self) -> list:
        """Return a list of field labels that have NOT been filled yet.
        Used by the voice AI to know which questions to ask the user."""
        filled = set(self.collected_fields.keys())
        missing = []
        for f in self.required_fields:
            name = f.get("field_name") or f.get("name", "")
            if name and name not in filled:
                missing.append(f.get("label", name))
        return missing

    def get_filled_fields(self) -> list:
        """Return labels of fields already filled."""
        filled = set(self.collected_fields.keys())
        result = []
        for f in self.required_fields:
            name = f.get("field_name") or f.get("name", "")
            if name in filled:
                result.append(f.get("label", name))
        return result

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
