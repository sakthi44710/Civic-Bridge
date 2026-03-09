"""
form_agent_service.py — Live browser form filling subagent

Architecture:
  - Playwright runs HEADFUL (headless=False) on Xvfb :99 display
  - User watches LIVE via noVNC iframe on port 6080 — NOT screenshots
  - Mistral Large 3 (Bedrock) main agent sends field values via tool_call
  - This subagent executes fills in live browser via Playwright
  - All Playwright calls go through ThreadPoolExecutor (sync API — no async issues)
  - OTP/CAPTCHA: detected -> pause -> send event to frontend -> wait -> resume
"""

import os
import sys
import threading
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"

# On Linux (Docker), point Playwright at Xvfb virtual display
if not IS_WINDOWS:
    os.environ["DISPLAY"] = os.getenv("DISPLAY", ":99")

# Single dedicated thread for all Playwright sync API calls
# NEVER use async_playwright with uvicorn -- it causes subprocess errors
_pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="playwright")

# Common field name aliases: maps various form field names → our canonical profile keys
FIELD_ALIASES: Dict[str, str] = {
    "full_name": "name", "applicant_name": "name", "fullname": "name",
    "first_name": "name", "fname": "name", "candidate_name": "name",
    "father_name": "father_name", "fathername": "father_name", "father": "father_name",
    "mother_name": "mother_name", "mothername": "mother_name", "mother": "mother_name",
    "date_of_birth": "dob", "dateofbirth": "dob", "birth_date": "dob",
    "dob": "dob", "DOB": "dob",
    "gender": "gender", "sex": "gender",
    "email": "email", "email_id": "email", "emailid": "email", "email_address": "email",
    "mobile": "phone_number", "mobile_number": "phone_number", "phone": "phone_number",
    "mobile_no": "phone_number", "mobileno": "phone_number", "contact": "phone_number",
    "phone_number": "phone_number", "contact_number": "phone_number",
    "aadhaar": "aadhaar_number", "aadhaar_number": "aadhaar_number",
    "aadhaar_no": "aadhaar_number", "aadhar": "aadhaar_number", "uid": "aadhaar_number",
    "pan": "pan_number", "pan_number": "pan_number", "pan_no": "pan_number",
    "state": "state", "district": "district", "pincode": "pincode",
    "pin": "pincode", "pin_code": "pincode", "postal_code": "pincode", "zip": "pincode",
    "address": "address", "permanent_address": "address", "residential_address": "address",
    "category": "category", "caste": "category", "caste_category": "category",
    "income": "annual_income", "annual_income": "annual_income", "family_income": "annual_income",
    "occupation": "occupation", "profession": "occupation",
    "education": "education_level", "qualification": "education_level",
    "education_level": "education_level",
    "bank_name": "bank_name", "bankname": "bank_name",
    "account_number": "bank_account", "bank_account": "bank_account",
    "account_no": "bank_account", "acno": "bank_account",
    "ifsc": "ifsc_code", "ifsc_code": "ifsc_code", "ifsccode": "ifsc_code",
}


@dataclass
class FormFillingSession:
    """One session per user per active form fill."""

    session_id: str
    scheme_id: str
    application_id: str
    user_id: str

    # Data collected from Mistral main agent via tool_calls
    collected_fields: Dict[str, str] = field(default_factory=dict)
    required_fields: List[Dict] = field(default_factory=list)
    total_fields: int = 0

    # State tracking
    status: str = "idle"        # idle|started|filling|waiting_otp|waiting_captcha|done|error
    waiting_for: Optional[str] = None   # None | 'otp' | 'captcha'
    current_page: int = 1
    total_pages: int = 1
    page_name: str = ""
    _page_fields_cache: List[Dict] = field(default_factory=list)

    # Playwright browser objects -- managed inside _pw_executor thread only
    _playwright = None
    _browser: Optional[Browser] = None
    _context: Optional[BrowserContext] = None

    # Background periodic screenshot task (asyncio.Task)
    _screenshot_task: Optional[asyncio.Task] = None
    _page: Optional[Page] = None

    # Events for blocking OTP/CAPTCHA waits inside executor thread
    _otp_event: threading.Event = field(default_factory=threading.Event)
    _captcha_event: threading.Event = field(default_factory=threading.Event)
    _otp_value: Optional[str] = None
    _captcha_value: Optional[str] = None

    # Backend WebSocket -- used to push form_update events to frontend
    _websocket = None

    def get_filled_fields(self) -> List[str]:
        return list(self.collected_fields.keys())

    def get_missing_fields(self) -> List[str]:
        filled = set(self.collected_fields.keys())
        return [f.get("label", f.get("key", "")) for f in self.required_fields if f.get("key") not in filled]


class FormAgentService:
    """Singleton that manages all active FormFillingSession instances."""

    def __init__(self):
        self._sessions: Dict[str, FormFillingSession] = {}
        self._loop = None

    def get_session(self, user_id: str) -> Optional[FormFillingSession]:
        return self._sessions.get(user_id)

    async def start_session(
        self,
        user_id: str,
        scheme_id: str,
        application_id: str,
        user_data: Dict,
        portal_url: str,
        websocket,
    ) -> FormFillingSession:
        """
        Start a new form filling session.
        Launches Chromium via Playwright in the dedicated executor thread.
        """
        logger.info(f"[FormAgent] start_session: user={user_id}, scheme={scheme_id}, portal={portal_url}")
        await self.close_session(user_id)

        session = FormFillingSession(
            session_id=f"sess_{user_id}_{scheme_id}",
            scheme_id=scheme_id,
            application_id=application_id,
            user_id=user_id,
        )
        session._websocket = websocket
        session.status = "started"
        self._sessions[user_id] = session
        self._loop = asyncio.get_running_loop()

        # Run browser launch in dedicated Playwright thread
        logger.info(f"[FormAgent] Dispatching _launch_browser to executor thread")
        await asyncio.get_running_loop().run_in_executor(
            _pw_executor,
            self._launch_browser,
            session,
            user_data,
            portal_url,
        )
        logger.info(f"[FormAgent] _launch_browser completed, session status={session.status}")
        # Start periodic screenshot streaming so the live view updates on redirects/page loads
        session._screenshot_task = asyncio.create_task(self._periodic_screenshot_loop(session))
        return session

    def _launch_browser(self, session: FormFillingSession, user_data: Dict, portal_url: str):
        """
        Runs inside _pw_executor thread.
        Linux (Docker): HEADFUL on Xvfb :99, streamed via noVNC.
        Windows (dev):  headless — no virtual display available.
        Falls back to local form_template.html if portal fails to load.
        """
        try:
            session._playwright = sync_playwright().start()

            # Send immediate update so frontend knows we're working
            self._send_update(session, {
                "status": "started",
                "message": "Launching browser…",
                "fields_filled": 0,
                "total_fields": 0,
            })

            launch_args = [
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--start-maximized",
                "--lang=en-IN",
            ]
            if not IS_WINDOWS:
                launch_args.insert(0, f"--display={os.environ.get('DISPLAY', ':99')}")

            session._browser = session._playwright.chromium.launch(
                headless=IS_WINDOWS,  # Windows: headless + screenshot stream; Linux: headful + noVNC
                args=launch_args,
            )

            session._context = session._browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                locale="en-IN",
                timezone_id="Asia/Kolkata",
            )

            session._page = session._context.new_page()

            # Try real portal first, fall back to local template
            navigated = False
            if portal_url:
                try:
                    logger.info(f"[FormAgent] Opening portal: {portal_url}")
                    self._send_update(session, {
                        "status": "filling",
                        "message": f"Opening {portal_url}…",
                        "fields_filled": 0,
                        "total_fields": 0,
                    })
                    session._page.goto(portal_url, wait_until="domcontentloaded", timeout=15000)
                    navigated = True
                    self._send_screenshot(session)
                except Exception as nav_err:
                    logger.warning(f"[FormAgent] Portal failed ({nav_err}), using local template")
                    self._send_update(session, {
                        "status": "filling",
                        "message": "Portal unreachable — using local form…",
                        "fields_filled": 0,
                        "total_fields": 0,
                    })
                    # Wait for error page to settle before navigating away
                    session._page.wait_for_timeout(1000)

            if not navigated:
                template_path = os.path.join(
                    os.path.dirname(__file__), "..", "static", "form_template.html"
                )
                template_path = os.path.abspath(template_path)
                logger.info(f"[FormAgent] Opening local template: {template_path}")
                session._page.goto(f"file:///{template_path}", wait_until="load", timeout=15000)
                self._send_screenshot(session)

            session.status = "filling"

            self._send_update(session, {
                "status": "filling",
                "message": "Discovering form fields…",
                "fields_filled": 0,
                "total_fields": 0,
                "portal_url": portal_url,
            })

            # Auto-fill all fields we already know from user profile + docs
            self._auto_fill_from_data(session, user_data)

            # Send final completion update
            filled = len(session.collected_fields)
            total = session.total_fields
            self._send_update(session, {
                "status": "done" if filled == total else "filling",
                "message": f"Filled {filled} of {total} fields" + (" — all done!" if filled == total else ""),
                "fields_filled": filled,
                "total_fields": total,
                "filled_fields": dict(session.collected_fields),
            })

        except Exception as e:
            logger.error(f"[FormAgent] Browser launch error: {e}")
            session.status = "error"
            self._send_update(session, {"status": "error", "message": str(e)})

    def _auto_fill_from_data(self, session: FormFillingSession, user_data: Dict):
        """
        Auto-fill form with user profile data + document-extracted fields.
        Each fill is visible live in noVNC: scroll -> cyan highlight -> type -> green bg.
        Uses FIELD_ALIASES to fuzzy-match form field names to profile keys.
        """
        if not session._page:
            logger.warning("[FormAgent] _auto_fill_from_data: no page")
            return

        logger.info(f"[FormAgent] _auto_fill_from_data starting with {len(user_data)} data keys: {list(user_data.keys())[:10]}")

        page = session._page
        fields = self._discover_fields(page)
        session._page_fields_cache = fields
        session.required_fields = fields
        session.total_fields = len(fields)
        filled_count = 0

        # Build a reverse lookup: canonical key -> value from user_data
        # user_data may have keys like "name", "dob", "phone_number", etc.
        canonical_data: Dict[str, str] = {}
        for k, v in user_data.items():
            if not v:
                continue
            canonical_key = FIELD_ALIASES.get(k.lower().replace("-", "_").replace(" ", "_"), k.lower())
            canonical_data[canonical_key] = str(v)

        for form_field in fields:
            selector = form_field.get("selector")
            field_key = form_field.get("key", "")
            field_label = form_field.get("label", "")
            field_type = form_field.get("type", "text")

            if not selector:
                continue

            # Try to find value: direct key match, then alias-normalized match, then label match
            value = (
                canonical_data.get(field_key)
                or canonical_data.get(FIELD_ALIASES.get(field_key, ""))
                or canonical_data.get(field_label.lower().replace(" ", "_").replace("-", "_"))
            )

            if not value:
                continue

            try:
                element = page.query_selector(selector)
                if not element:
                    continue

                # Scroll into view -- user can follow along in noVNC
                element.scroll_into_view_if_needed()
                page.wait_for_timeout(200)

                # Cyan outline highlight before filling
                page.evaluate(
                    "(sel) => { const el=document.querySelector(sel); if(el){"
                    "el.style.outline='3px solid #00FFFF';"
                    "el.style.boxShadow='0 0 8px #00FFFF';} }",
                    selector,
                )
                page.wait_for_timeout(300)

                if field_type == "select":
                    element.select_option(value=value)
                elif field_type == "checkbox":
                    if value.lower() in ("true", "yes", "1"):
                        element.check()
                elif field_type == "radio":
                    page.click(f'{selector}[value="{value}"]')
                else:
                    element.click()
                    element.fill("")
                    page.keyboard.type(value, delay=40)  # Char-by-char visible in noVNC

                # Green background after successful fill
                page.evaluate(
                    "(sel) => { const el=document.querySelector(sel); if(el){"
                    "el.style.outline='';"
                    "el.style.boxShadow='';"
                    "el.style.backgroundColor='#e8f5e9';} }",
                    selector,
                )

                session.collected_fields[field_key] = value
                filled_count += 1

                self._send_update(session, {
                    "status": "filling",
                    "fields_filled": filled_count,
                    "total_fields": session.total_fields,
                    "newly_filled": [field_key],
                    "filled_fields": session.collected_fields,
                })
                self._send_screenshot(session)
                page.wait_for_timeout(200)

            except Exception as e:
                logger.warning(f"[FormAgent] Could not fill '{field_key}': {e}")

        # Try AI-powered field mapping for any remaining unfilled fields
        if filled_count < session.total_fields and canonical_data:
            self._ai_fill_remaining(session, canonical_data)

        # Check for CAPTCHA after auto-fill
        if self._has_captcha(page):
            session.status = "waiting_captcha"
            session.waiting_for = "captcha"
            self._send_update(session, {
                "status": "waiting_captcha",
                "message": "CAPTCHA detected -- please solve it",
            })
            session._captcha_event.wait(timeout=120)
            session._captcha_event.clear()

    def _ai_fill_remaining(self, session: FormFillingSession, canonical_data: Dict[str, str]):
        """Use AI PageAnalyzer to map remaining unfilled fields."""
        page = session._page
        if not page:
            return
        try:
            from app.services.page_analyzer import PageAnalyzer
            unfilled = [f for f in session._page_fields_cache if f["key"] not in session.collected_fields]
            if not unfilled:
                return
            mapping = PageAnalyzer.map_data_to_fields(canonical_data, unfilled)
            for m in mapping.get("mappings", []):
                selector = m.get("selector")
                value = m.get("value")
                fname = m.get("field_name", "")
                if not selector or not value:
                    continue
                try:
                    el = page.query_selector(selector)
                    if not el:
                        continue
                    el.scroll_into_view_if_needed()
                    page.wait_for_timeout(150)
                    el.click()
                    el.fill("")
                    ftype = m.get("type", "text")
                    if ftype == "select":
                        el.select_option(value=value)
                    else:
                        page.keyboard.type(str(value), delay=40)
                    page.evaluate(
                        "(sel) => { const el=document.querySelector(sel); if(el){"
                        "el.style.backgroundColor='#e8f5e9';} }",
                        selector,
                    )
                    session.collected_fields[fname] = str(value)
                    self._send_update(session, {
                        "status": "filling",
                        "fields_filled": len(session.collected_fields),
                        "total_fields": session.total_fields,
                        "newly_filled": [fname],
                        "filled_fields": session.collected_fields,
                    })
                except Exception as e:
                    logger.warning(f"[FormAgent] AI fill '{fname}' failed: {e}")
        except Exception as e:
            logger.warning(f"[FormAgent] AI field mapping failed: {e}")

    def _discover_fields(self, page: Page) -> List[Dict]:
        """
        Discover all input fields on the current page.
        Strategy:
          1. Try AI-powered PageAnalyzer for robust field discovery (works on any portal)
          2. Fall back to basic DOM query if AI fails
        """
        # ── Attempt 1: AI-powered analysis ──────────────────────────
        try:
            from app.services.page_analyzer import PageAnalyzer
            ai_result = PageAnalyzer.analyze_page(page)
            if ai_result and ai_result.get("fields"):
                ai_fields = []
                for f in ai_result["fields"]:
                    selector = f.get("selector", "")
                    field_name = f.get("field_name", "")
                    label = f.get("label", field_name)
                    ftype = f.get("type", "text")
                    # Verify the selector actually resolves on the page
                    try:
                        el = page.query_selector(selector)
                        if not el:
                            continue
                    except Exception:
                        continue
                    # Normalize field_name through aliases
                    key = FIELD_ALIASES.get(field_name, field_name)
                    ai_fields.append({
                        "selector": selector,
                        "key": key,
                        "label": label,
                        "type": ftype,
                    })
                if ai_fields:
                    logger.info(f"[FormAgent] AI discovered {len(ai_fields)} fields")
                    return ai_fields
        except Exception as e:
            logger.warning(f"[FormAgent] AI field discovery failed, falling back to DOM: {e}")

        # ── Attempt 2: Basic DOM query fallback ─────────────────────
        fields = []
        try:
            inputs = page.query_selector_all(
                "input:not([type=hidden]):not([type=submit]):not([type=button]),"
                "select,textarea"
            )
            for i, el in enumerate(inputs):
                input_type = el.get_attribute("type") or "text"
                name_attr = el.get_attribute("name") or ""
                id_attr = el.get_attribute("id") or ""
                placeholder = el.get_attribute("placeholder") or ""
                tag = el.evaluate("el => el.tagName.toLowerCase()")

                # Build a reliable selector that actually works
                if name_attr:
                    selector = f'[name="{name_attr}"]'
                elif id_attr:
                    selector = f'#{id_attr}'
                else:
                    # Use nth-of-type for elements without name/id
                    selector = f'input:nth-of-type({i + 1})' if tag == "input" else f'{tag}:nth-of-type({i + 1})'
                    # Verify it actually resolves
                    try:
                        if not page.query_selector(selector):
                            continue
                    except Exception:
                        continue

                raw_key = (name_attr or id_attr or placeholder or f"field_{i}").lower().replace("-", "_").replace(" ", "_")
                # Normalize through alias map
                key = FIELD_ALIASES.get(raw_key, raw_key)

                fields.append({
                    "selector": selector,
                    "key": key,
                    "label": placeholder or name_attr or id_attr or f"Field {i+1}",
                    "type": tag if tag == "select" else input_type,
                })
        except Exception as e:
            logger.error(f"[FormAgent] Field discovery error: {e}")
        logger.info(f"[FormAgent] DOM discovered {len(fields)} fields")
        return fields

    def _has_captcha(self, page: Page) -> bool:
        """Detect common CAPTCHA patterns on Indian govt portals."""
        for selector in [
            "iframe[src*='recaptcha']", "iframe[src*='captcha']",
            ".g-recaptcha", "#captcha", "[id*='captcha']",
            "[class*='captcha']", "img[src*='captcha']",
        ]:
            if page.query_selector(selector):
                return True
        return False

    async def provide_field(self, user_id: str, field_name: str, value: str) -> Dict:
        """
        Called when Mistral agent sends provide_field_data tool_call.
        Fills a specific field in the live browser.
        """
        session = self.get_session(user_id)
        if not session or not session._page:
            return {"success": False, "error": "No active form session"}

        return await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._fill_single_field, session, field_name, value
        )

    def _fill_single_field(self, session: FormFillingSession, field_name: str, value: str) -> Dict:
        """Fill one field. Cyan highlight before, green after. Visible in noVNC."""
        page = session._page
        if not page:
            return {"success": False, "error": "Page not available"}

        # Normalize the incoming field_name through aliases
        normalized = FIELD_ALIASES.get(field_name.lower().replace("-", "_").replace(" ", "_"), field_name.lower())

        # Find the selector from cached fields
        selector = None
        for f in session._page_fields_cache:
            fkey = f.get("key", "")
            flabel = f.get("label", "")
            if fkey == field_name or fkey == normalized or flabel.lower() == field_name.lower():
                selector = f["selector"]
                break

        # Fallback: try common DOM selectors
        if not selector:
            for attempt in [
                f'[name="{field_name}"]', f'[id="{field_name}"]',
                f'[name="{normalized}"]', f'[id="{normalized}"]',
                f'[placeholder*="{field_name}" i]',
            ]:
                try:
                    if page.query_selector(attempt):
                        selector = attempt
                        break
                except Exception:
                    pass

        if not selector:
            return {"success": False, "error": f"Field '{field_name}' not found on page"}

        try:
            element = page.query_selector(selector)
            element.scroll_into_view_if_needed()

            # Highlight cyan
            page.evaluate(
                "(sel) => { const el=document.querySelector(sel); if(el){"
                "el.style.outline='3px solid #00FFFF';"
                "el.style.boxShadow='0 0 12px #00FFFF88';} }",
                selector,
            )
            page.wait_for_timeout(400)

            element.click()
            element.fill("")
            page.keyboard.type(value, delay=50)

            # Turn green after fill
            page.evaluate(
                "(sel) => { const el=document.querySelector(sel); if(el){"
                "el.style.outline='';"
                "el.style.boxShadow='';"
                "el.style.backgroundColor='#e8f5e9';} }",
                selector,
            )

            session.collected_fields[field_name] = value
            self._send_update(session, {
                "status": "filling",
                "newly_filled": [field_name],
                "fields_filled": len(session.collected_fields),
                "total_fields": session.total_fields,
                "filled_fields": session.collected_fields,
            })
            return {"success": True, "field": field_name, "value": value}

        except Exception as e:
            logger.error(f"[FormAgent] Fill error '{field_name}': {e}")
            return {"success": False, "error": str(e)}

    async def submit_otp(self, user_id: str, otp: str) -> Dict:
        """User provided OTP (via voice or modal) -> fill in live browser."""
        session = self.get_session(user_id)
        if not session:
            return {"success": False, "error": "No session"}

        session._otp_value = otp
        session._otp_event.set()
        session.status = "filling"
        session.waiting_for = None

        await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._fill_otp_in_browser, session, otp
        )
        return {"success": True}

    def _fill_otp_in_browser(self, session: FormFillingSession, otp: str):
        page = session._page
        if not page:
            return
        for selector in ["#otp", "[name='otp']", "[id*='otp']", "[placeholder*='OTP']",
                         "[placeholder*='otp']", "input[maxlength='6']", "input[maxlength='4']"]:
            el = page.query_selector(selector)
            if el:
                el.scroll_into_view_if_needed()
                el.click()
                el.fill(otp)
                page.wait_for_timeout(300)
                self._send_update(session, {"status": "otp_submitted", "message": "OTP submitted"})
                return

    async def submit_captcha(self, user_id: str, answer: str) -> Dict:
        """User typed CAPTCHA answer in modal -> fill in live browser."""
        session = self.get_session(user_id)
        if not session:
            return {"success": False, "error": "No session"}

        session._captcha_value = answer
        session._captcha_event.set()
        session.status = "filling"
        session.waiting_for = None

        await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._fill_captcha_in_browser, session, answer
        )
        return {"success": True}

    def _fill_captcha_in_browser(self, session: FormFillingSession, answer: str):
        page = session._page
        if not page:
            return
        for selector in ["#captcha", "[name='captcha']", "[id*='captcha']",
                         "[placeholder*='captcha']", "[placeholder*='CAPTCHA']", "input[name*='verify']"]:
            el = page.query_selector(selector)
            if el:
                el.scroll_into_view_if_needed()
                el.click()
                el.fill(answer)
                page.wait_for_timeout(300)
                self._send_update(session, {"status": "captcha_submitted", "message": "CAPTCHA submitted"})
                return

    # ── Autonomous browser control (AI agent can freely operate the browser) ──

    async def browser_action(self, user_id: str, action: str, params: Dict) -> Dict:
        """Execute a browser control action. Sends screenshot after every action."""
        session = self.get_session(user_id)
        if not session or not session._page:
            return {"success": False, "error": "No active browser session. Call start_form_filling first to open a browser."}
        return await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._exec_browser_action, session, action, params
        )

    def _exec_browser_action(self, session: FormFillingSession, action: str, params: Dict) -> Dict:
        """Dispatch and execute a browser action in the Playwright thread."""
        page = session._page
        if not page:
            return {"success": False, "error": "Browser page not available"}
        try:
            handler = getattr(self, f"_act_{action}", None)
            if not handler:
                return {"success": False, "error": f"Unknown browser action: {action}"}
            result = handler(page, session, params)
            self._send_screenshot(session)
            return result
        except Exception as e:
            logger.error(f"[FormAgent] browser_action '{action}' error: {e}")
            self._send_screenshot(session)
            return {"success": False, "error": str(e)}

    def _act_navigate(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        url = p.get("url", "")
        if not url:
            return {"success": False, "error": "No URL provided"}
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(1000)
        return {"success": True, "url": page.url, "title": page.title()}

    def _act_click(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        selector = p.get("selector")
        text = p.get("text")
        if selector:
            el = page.query_selector(selector)
            if not el:
                return {"success": False, "error": f"Element not found: {selector}"}
            el.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            el.click()
            page.wait_for_timeout(500)
            return {"success": True, "clicked": selector}
        elif text:
            for strat in [
                f'button:has-text("{text}")',
                f'a:has-text("{text}")',
                f'[role="button"]:has-text("{text}")',
                f'input[value="{text}"]',
                f'label:has-text("{text}")',
            ]:
                try:
                    loc = page.locator(strat).first
                    if loc.count() > 0 and loc.is_visible():
                        loc.scroll_into_view_if_needed()
                        page.wait_for_timeout(200)
                        loc.click()
                        page.wait_for_timeout(500)
                        return {"success": True, "clicked_text": text}
                except Exception:
                    continue
            return {"success": False, "error": f"No clickable element with text: '{text}'"}
        return {"success": False, "error": "Provide 'selector' or 'text' to click"}

    def _act_type(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        text = p.get("text", "")
        selector = p.get("selector")
        clear_first = p.get("clear_first", True)
        if selector:
            el = page.query_selector(selector)
            if not el:
                return {"success": False, "error": f"Element not found: {selector}"}
            el.scroll_into_view_if_needed()
            el.click()
            if clear_first:
                el.fill("")
            page.keyboard.type(text, delay=30)
        else:
            if clear_first:
                page.keyboard.press("Control+a")
                page.keyboard.press("Backspace")
            page.keyboard.type(text, delay=30)
        page.wait_for_timeout(200)
        return {"success": True, "typed": text[:50]}

    def _act_scroll(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        direction = p.get("direction", "down")
        amount = int(p.get("amount", 400))
        if direction == "up":
            amount = -amount
        page.evaluate(f"window.scrollBy(0, {amount})")
        page.wait_for_timeout(300)
        return {"success": True, "scrolled": direction, "pixels": abs(int(p.get("amount", 400)))}

    def _act_press_key(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        key = p.get("key", "Enter")
        page.keyboard.press(key)
        page.wait_for_timeout(500)
        return {"success": True, "key": key}

    def _act_select_option(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        selector = p.get("selector", "")
        value = p.get("value", "")
        el = page.query_selector(selector)
        if not el:
            return {"success": False, "error": f"Select element not found: {selector}"}
        try:
            el.select_option(value=value)
        except Exception:
            try:
                el.select_option(label=value)
            except Exception:
                # Try partial match on options
                options = el.evaluate("el => [...el.options].map(o => ({value: o.value, text: o.text}))")
                for opt in options:
                    if value.lower() in opt["text"].lower() or value.lower() in opt["value"].lower():
                        el.select_option(value=opt["value"])
                        return {"success": True, "selected": opt["text"]}
                return {"success": False, "error": f"Option '{value}' not found in dropdown"}
        page.wait_for_timeout(200)
        return {"success": True, "selected": value}

    def _act_back(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        page.go_back(wait_until="domcontentloaded", timeout=10000)
        page.wait_for_timeout(500)
        return {"success": True, "url": page.url, "title": page.title()}

    def _act_read_screen(self, page: Page, session: FormFillingSession, p: Dict) -> Dict:
        """Extract structured page info so the AI can understand what's on screen."""
        try:
            info = page.evaluate("""() => {
                const r = {
                    url: window.location.href,
                    title: document.title,
                    headings: [],
                    inputs: [],
                    selects: [],
                    buttons: [],
                    links: [],
                    text_content: ''
                };
                document.querySelectorAll('h1,h2,h3,h4').forEach(el => {
                    const t = el.textContent.trim();
                    if (t) r.headings.push(t.slice(0, 100));
                });
                r.headings = r.headings.slice(0, 10);
                document.querySelectorAll('input:not([type=hidden]), textarea').forEach((el, i) => {
                    if (!el.offsetParent && el.type !== 'hidden') return;
                    const lbl = el.id ? document.querySelector('label[for="'+el.id+'"]') : null;
                    const label = lbl ? lbl.textContent.trim() : el.placeholder || el.name || el.id || '';
                    r.inputs.push({
                        selector: el.id ? '#'+el.id : el.name ? '[name="'+el.name+'"]' : 'input:nth-of-type('+(i+1)+')',
                        type: el.type || 'text',
                        label: label.slice(0, 60),
                        value: el.value ? el.value.slice(0, 40) : '',
                        placeholder: (el.placeholder || '').slice(0, 40)
                    });
                });
                r.inputs = r.inputs.slice(0, 30);
                document.querySelectorAll('select').forEach((el, i) => {
                    if (!el.offsetParent) return;
                    const lbl = el.id ? document.querySelector('label[for="'+el.id+'"]') : null;
                    const label = lbl ? lbl.textContent.trim() : el.name || el.id || '';
                    const opts = [...el.options].map(o => o.text.trim()).filter(Boolean).slice(0, 10);
                    r.selects.push({
                        selector: el.id ? '#'+el.id : el.name ? '[name="'+el.name+'"]' : 'select:nth-of-type('+(i+1)+')',
                        label: label.slice(0, 60),
                        selected: el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '',
                        options: opts
                    });
                });
                r.selects = r.selects.slice(0, 15);
                document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(el => {
                    if (!el.offsetParent) return;
                    const txt = (el.textContent || el.value || '').trim();
                    if (!txt) return;
                    r.buttons.push({
                        selector: el.id ? '#'+el.id : el.name ? '[name="'+el.name+'"]' : null,
                        text: txt.slice(0, 50),
                        type: el.type || 'button'
                    });
                });
                r.buttons = r.buttons.slice(0, 15);
                document.querySelectorAll('a[href]').forEach(el => {
                    if (!el.offsetParent) return;
                    const txt = el.textContent.trim();
                    if (!txt || txt.length < 2) return;
                    r.links.push({ text: txt.slice(0, 60), href: el.href });
                });
                r.links = r.links.slice(0, 20);
                const body = document.body.cloneNode(true);
                body.querySelectorAll('script,style,noscript,svg').forEach(el => el.remove());
                r.text_content = body.textContent.replace(/\\s+/g, ' ').trim().slice(0, 2000);
                return r;
            }""")
            info["success"] = True
            return info
        except Exception as e:
            return {"success": False, "error": str(e), "url": page.url, "title": page.title()}

    async def _periodic_screenshot_loop(self, session: FormFillingSession):
        """Background task: stream screenshots every ~750ms so the live view stays current."""
        try:
            while True:
                await asyncio.sleep(0.75)
                if not session._page or session.status in ("error", "idle"):
                    break
                try:
                    await asyncio.get_running_loop().run_in_executor(
                        _pw_executor, self._send_screenshot, session
                    )
                except Exception:
                    pass
        except asyncio.CancelledError:
            pass

    def _scroll_captcha_into_view(self, page: Page):
        """Try to find a CAPTCHA element on the page and scroll it into the viewport."""
        try:
            found = page.evaluate("""() => {
                // Look for captcha images, inputs, or containers
                const selectors = [
                    'img[src*="captcha" i]', 'img[alt*="captcha" i]', 'img[id*="captcha" i]',
                    'img[class*="captcha" i]', 'img[src*="Captcha" i]',
                    'input[name*="captcha" i]', 'input[id*="captcha" i]',
                    'input[placeholder*="captcha" i]',
                    '[class*="captcha" i]', '[id*="captcha" i]',
                    'canvas[id*="captcha" i]', 'canvas[class*="captcha" i]',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.offsetParent !== null) {
                        el.scrollIntoView({ behavior: 'instant', block: 'center' });
                        return true;
                    }
                }
                // Fallback: scroll to the very bottom where CAPTCHAs usually appear
                window.scrollTo(0, document.body.scrollHeight);
                return false;
            }""")
            page.wait_for_timeout(300)
            return found
        except Exception as e:
            logger.debug(f"[FormAgent] _scroll_captcha_into_view error: {e}")
            return False

    async def scroll_to_captcha(self, user_id: str) -> bool:
        """Public async method: scroll captcha into view for a user's session."""
        session = self.get_session(user_id)
        if not session or not session._page:
            return False
        return await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._scroll_captcha_into_view, session._page
        )

    def _send_screenshot(self, session: FormFillingSession):
        """Capture page screenshot and stream to frontend as base64 JPEG."""
        if not session._page or not session._websocket or not self._loop:
            return
        try:
            # When waiting for CAPTCHA, ensure it's scrolled into the viewport
            if session.waiting_for == "captcha":
                self._scroll_captcha_into_view(session._page)
            img_bytes = session._page.screenshot(type="jpeg", quality=55)
            import base64
            b64 = base64.b64encode(img_bytes).decode("ascii")
            payload = {"type": "form_screenshot", "data": f"data:image/jpeg;base64,{b64}"}
            future = asyncio.run_coroutine_threadsafe(
                session._websocket.send_json(payload),
                self._loop,
            )
            future.result(timeout=5)
        except Exception as e:
            logger.debug(f"[FormAgent] Screenshot send failed: {e}")

    def _send_update(self, session: FormFillingSession, data: Dict):
        """
        Push form_update event to frontend WebSocket.
        Must use run_coroutine_threadsafe -- called from executor thread, not async context.
        """
        if not session._websocket or not self._loop:
            logger.warning(f"[FormAgent] _send_update skipped: ws={bool(session._websocket)} loop={bool(self._loop)}")
            return
        payload = {
            "type": "form_update",
            "data": {
                "session_id": session.session_id,
                "application_id": session.application_id,
                "scheme_id": session.scheme_id,
                "waiting_for": session.waiting_for,
                "current_page": session.current_page,
                "total_pages": session.total_pages,
                **data,
            },
        }
        try:
            future = asyncio.run_coroutine_threadsafe(
                session._websocket.send_json(payload),
                self._loop,
            )
            # Wait briefly for the send to complete so errors surface
            future.result(timeout=5)
            logger.debug(f"[FormAgent] Sent form_update: fields_filled={data.get('fields_filled')}, total={data.get('total_fields')}")
        except Exception as e:
            logger.error(f"[FormAgent] _send_update failed: {e}")

    async def close_session(self, user_id: str):
        """Stop browser, cleanup session."""
        session = self._sessions.pop(user_id, None)
        if not session:
            return
        # Cancel periodic screenshot task
        if session._screenshot_task:
            session._screenshot_task.cancel()
            try:
                await session._screenshot_task
            except asyncio.CancelledError:
                pass
        await asyncio.get_running_loop().run_in_executor(
            _pw_executor, self._close_browser, session
        )

    def _close_browser(self, session: FormFillingSession):
        try:
            if session._page: session._page.close()
            if session._context: session._context.close()
            if session._browser: session._browser.close()
            if session._playwright: session._playwright.stop()
        except Exception as e:
            logger.warning(f"[FormAgent] Close error: {e}")


# Module-level singleton
form_agent_service = FormAgentService()
