"""
form_agent_service.py — Live browser form filling subagent

Architecture:
  - Playwright runs HEADFUL (headless=False) on Xvfb :99 display
  - User watches LIVE via noVNC iframe on port 6080 — NOT screenshots
  - ElevenLabs main agent (Claude Haiku 4.5) sends field values via tool_call
  - This subagent (Claude Sonnet 4.6 on Bedrock) executes fills in browser
  - All Playwright calls go through ThreadPoolExecutor (sync API — no async issues)
  - OTP/CAPTCHA: detected -> pause -> send event to frontend -> wait -> resume
"""

import os
import threading
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

logger = logging.getLogger(__name__)

# Point Playwright at Xvfb virtual display
os.environ["DISPLAY"] = os.getenv("DISPLAY", ":99")

# Single dedicated thread for all Playwright sync API calls
# NEVER use async_playwright with uvicorn -- it causes subprocess errors
_pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="playwright")


@dataclass
class FormFillingSession:
    """One session per user per active form fill."""

    session_id: str
    scheme_id: str
    application_id: str
    user_id: str

    # Data collected from ElevenLabs main agent via tool_calls
    collected_fields: Dict[str, str] = field(default_factory=dict)
    required_fields: List[Dict] = field(default_factory=list)
    total_fields: int = 0

    # State tracking
    status: str = "idle"        # idle|started|filling|waiting_otp|waiting_captcha|done|error
    waiting_for: Optional[str] = None   # None | 'otp' | 'captcha'
    current_page: int = 1
    total_pages: int = 1
    page_name: str = ""
    _on_real_portal: bool = False
    _page_fields_cache: List[Dict] = field(default_factory=list)

    # Playwright browser objects -- managed inside _pw_executor thread only
    _playwright = None
    _browser: Optional[Browser] = None
    _context: Optional[BrowserContext] = None
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
        return [f["label"] for f in self.required_fields if f.get("label") not in filled]


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
        Launches headful Chromium on Xvfb :99.
        User sees the browser live via noVNC (port 6080).
        """
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
        self._loop = asyncio.get_event_loop()

        # Run browser launch in dedicated Playwright thread
        await asyncio.get_event_loop().run_in_executor(
            _pw_executor,
            self._launch_browser,
            session,
            user_data,
            portal_url,
        )
        return session

    def _launch_browser(self, session: FormFillingSession, user_data: Dict, portal_url: str):
        """
        Runs inside _pw_executor thread.
        Launches HEADFUL Chromium on Xvfb :99.
        The browser appears on the virtual display, streamed to user via noVNC.
        """
        try:
            session._playwright = sync_playwright().start()

            session._browser = session._playwright.chromium.launch(
                headless=False,   # HEADFUL -- user sees this via noVNC
                args=[
                    f"--display={os.environ['DISPLAY']}",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--start-maximized",
                    "--lang=en-IN",
                ],
                executable_path=self._get_chromium_path(),
            )

            session._context = session._browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                locale="en-IN",
                timezone_id="Asia/Kolkata",
            )

            session._page = session._context.new_page()

            logger.info(f"[FormAgent] Opening {portal_url}")
            session._page.goto(portal_url, wait_until="domcontentloaded", timeout=30000)
            session._on_real_portal = True
            session.status = "filling"

            self._send_update(session, {
                "status": "started",
                "message": "Live browser opened via noVNC",
                "portal_url": portal_url,
            })

            # Auto-fill all fields we already know from user profile + docs
            self._auto_fill_from_data(session, user_data)

        except Exception as e:
            logger.error(f"[FormAgent] Browser launch error: {e}")
            session.status = "error"
            self._send_update(session, {"status": "error", "message": str(e)})

    def _get_chromium_path(self) -> Optional[str]:
        """Find system Chromium binary installed in Docker."""
        for path in ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]:
            if os.path.exists(path):
                return path
        return None

    def _auto_fill_from_data(self, session: FormFillingSession, user_data: Dict):
        """
        Auto-fill form with user profile data + document-extracted fields.
        Each fill is visible live in noVNC: scroll -> cyan highlight -> type -> green bg.
        """
        if not session._page:
            return

        page = session._page
        fields = self._discover_fields(page)
        session._page_fields_cache = fields
        session.required_fields = fields
        session.total_fields = len(fields)
        filled_count = 0

        for form_field in fields:
            selector = form_field.get("selector")
            field_key = form_field.get("key")
            field_type = form_field.get("type", "text")
            value = user_data.get(field_key) or user_data.get(form_field.get("label", ""))

            if not value or not selector:
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
                page.wait_for_timeout(200)

            except Exception as e:
                logger.warning(f"[FormAgent] Could not fill '{field_key}': {e}")

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

    def _discover_fields(self, page: Page) -> List[Dict]:
        """
        Discover all input fields on the current page.
        In production: call PageAnalyzer with Bedrock Claude Sonnet 4.6
        for intelligent AI-powered field discovery on unknown govt portals.
        """
        fields = []
        try:
            inputs = page.query_selector_all(
                "input:not([type=hidden]):not([type=submit]):not([type=button]),"
                "select,textarea"
            )
            for i, el in enumerate(inputs):
                input_type = el.get_attribute("type") or "text"
                name = el.get_attribute("name") or el.get_attribute("id") or f"field_{i}"
                placeholder = el.get_attribute("placeholder") or ""
                tag = el.evaluate("el => el.tagName.toLowerCase()")
                fields.append({
                    "selector": f'[name="{name}"]' if el.get_attribute("name") else f'#{name}',
                    "key": name.lower().replace("-", "_").replace(" ", "_"),
                    "label": placeholder or name,
                    "type": tag if tag == "select" else input_type,
                })
        except Exception as e:
            logger.error(f"[FormAgent] Field discovery error: {e}")
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
        Called when ElevenLabs agent sends provide_field_data tool_call.
        Fills a specific field in the live browser.
        """
        session = self.get_session(user_id)
        if not session or not session._page:
            return {"success": False, "error": "No active form session"}

        return await asyncio.get_event_loop().run_in_executor(
            _pw_executor, self._fill_single_field, session, field_name, value
        )

    def _fill_single_field(self, session: FormFillingSession, field_name: str, value: str) -> Dict:
        """Fill one field. Cyan highlight before, green after. Visible in noVNC."""
        page = session._page
        if not page:
            return {"success": False, "error": "Page not available"}

        # Find the selector
        selector = None
        for f in session._page_fields_cache:
            if f["key"] == field_name or f["label"].lower() == field_name.lower():
                selector = f["selector"]
                break

        if not selector:
            for attempt in [f'[name="{field_name}"]', f'[id="{field_name}"]', f'[placeholder*="{field_name}"]']:
                if page.query_selector(attempt):
                    selector = attempt
                    break

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
        """User provided OTP (via ElevenLabs voice or modal) -> fill in live browser."""
        session = self.get_session(user_id)
        if not session:
            return {"success": False, "error": "No session"}

        session._otp_value = otp
        session._otp_event.set()
        session.status = "filling"
        session.waiting_for = None

        await asyncio.get_event_loop().run_in_executor(
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

        await asyncio.get_event_loop().run_in_executor(
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

    def _send_update(self, session: FormFillingSession, data: Dict):
        """
        Push form_update event to frontend WebSocket.
        Must use run_coroutine_threadsafe -- called from executor thread, not async context.
        """
        if not session._websocket or not self._loop:
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
        asyncio.run_coroutine_threadsafe(
            session._websocket.send_json(payload),
            self._loop,
        )

    async def close_session(self, user_id: str):
        """Stop browser, cleanup session."""
        session = self._sessions.pop(user_id, None)
        if not session:
            return
        await asyncio.get_event_loop().run_in_executor(
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
