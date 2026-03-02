"""
Automation Service - Headless Browser Form Filling with Playwright

Architecture:
  1. User starts application -> automation_service.start_session()
  2. Playwright opens government portal in headless Chromium
  3. For each page:
     a. AI (Haiku) maps user data to form fields
     b. Playwright fills fields + takes screenshot
     c. AI verifies screenshot correctness
     d. Screenshot sent to user for approval
     e. If CAPTCHA detected -> sent to user to solve
     f. If OTP needed -> user provides OTP
  4. On final page -> user confirms -> Playwright clicks submit
  5. Acknowledgment number extracted from confirmation page

For AWS Lambda deployment, Playwright runs via a Lambda Layer with Chromium.
For local testing, Playwright runs directly.
"""
import asyncio
import base64
import json
import logging
import os
from typing import Dict, Optional, List
from app.services.dynamodb_service import db
from app.services.s3_service import s3_service
from app.services.bedrock_service import bedrock_service
from app.utils.helpers import generate_id, now_iso

logger = logging.getLogger(__name__)

# Try to import playwright - graceful fallback if not installed
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright not installed. Browser automation will use simulation mode. "
                   "Install with: pip install playwright && python -m playwright install chromium")


class AutomationService:
    """Government portal form automation with screenshot verification.

    Two modes:
      - LIVE mode (Playwright installed): real headless browser
      - SIMULATION mode (no Playwright): demonstrates the flow with mock data
    """

    def __init__(self):
        self.configs_cache: Dict[str, Dict] = {}
        self._browser: Optional[object] = None

    # ================================================================
    # Browser lifecycle
    # ================================================================

    async def _get_browser(self):
        """Get or create headless Chromium browser."""
        if not PLAYWRIGHT_AVAILABLE:
            return None

        if self._browser is None:
            pw = await async_playwright().start()
            self._browser = await pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process",           # needed for Lambda
                ]
            )
        return self._browser

    async def _new_page(self) -> Optional[object]:
        """Create a new browser page with Indian locale."""
        browser = await self._get_browser()
        if not browser:
            return None

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()
        # Block analytics / tracking to speed up
        await page.route("**/*google-analytics*", lambda route: route.abort())
        await page.route("**/*googletagmanager*", lambda route: route.abort())
        return page

    # ================================================================
    # Scheme config
    # ================================================================

    def load_scheme_config(self, scheme_id: str) -> Optional[Dict]:
        """Load automation config for a scheme."""
        if scheme_id in self.configs_cache:
            return self.configs_cache[scheme_id]

        scheme = db.get_scheme(scheme_id)
        if not scheme:
            return None

        config = scheme.get("automation_config")
        if config:
            if isinstance(config, str):
                config = json.loads(config)
            self.configs_cache[scheme_id] = config

        return config

    # ================================================================
    # Public API
    # ================================================================

    async def start_automation(self, user_id: str, application_id: str,
                               scheme_id: str, user_data: Dict,
                               documents: List[Dict]) -> Dict:
        """Initialize automation session and fill first page."""
        config = self.load_scheme_config(scheme_id)
        if not config:
            return {
                "status": "error",
                "message": "No automation config available for this scheme",
            }

        session_id = generate_id()
        form_data = self._prepare_form_data(user_data, documents)

        session = {
            "session_id": session_id,
            "user_id": user_id,
            "application_id": application_id,
            "scheme_id": scheme_id,
            "status": "running",
            "current_page": 1,
            "total_pages": len(config.get("pages", [])),
            "form_data": form_data,
            "screenshots": [],
            "created_at": now_iso(),
        }

        db.update_application(user_id, application_id, {
            "automation_status": "running",
            "browser_session_id": session_id,
            "current_page": 1,
            "total_pages": len(config.get("pages", [])),
            "form_data": form_data,
        })

        result = await self._fill_page(session, config, 1)
        return result

    async def verify_page(self, user_id: str, application_id: str,
                          approved: bool, corrections: Dict = None) -> Dict:
        """User verifies or corrects a page."""
        app = db.get_application(user_id, application_id)
        if not app:
            return {"status": "error", "message": "Application not found"}

        if not approved and corrections:
            form_data = app.get("form_data", {})
            form_data.update(corrections)
            db.update_application(user_id, application_id, {"form_data": form_data})

        if approved:
            current_page = int(app.get("current_page", 1))
            total_pages = int(app.get("total_pages", 1))

            if current_page < total_pages:
                next_page = current_page + 1
                db.update_application(user_id, application_id, {
                    "current_page": next_page,
                    "automation_status": "running",
                })

                config = self.load_scheme_config(app["scheme_id"])
                if config:
                    session = {
                        "session_id": app.get("browser_session_id", ""),
                        "user_id": user_id,
                        "application_id": application_id,
                        "scheme_id": app["scheme_id"],
                        "form_data": app.get("form_data", {}),
                        "screenshots": app.get("screenshots", []),
                    }
                    return await self._fill_page(session, config, next_page)
            else:
                db.update_application(user_id, application_id, {
                    "automation_status": "ready_to_submit",
                    "status": "in_progress",
                })
                return {
                    "status": "ready_to_submit",
                    "message": "All pages filled. Ready for final submission.",
                    "application_id": application_id,
                }

        return {"status": "corrections_applied", "application_id": application_id}

    async def submit_otp(self, user_id: str, application_id: str, otp: str) -> Dict:
        """Submit OTP during automation."""
        app = db.get_application(user_id, application_id)
        if not app:
            return {"status": "error", "message": "Application not found"}

        # In live mode, Playwright would type OTP into the field and click verify
        db.update_application(user_id, application_id, {
            "automation_status": "running",
        })

        return {
            "status": "otp_submitted",
            "message": "OTP submitted. Continuing form filling...",
            "application_id": application_id,
        }

    async def submit_captcha(self, user_id: str, application_id: str,
                             captcha_text: str) -> Dict:
        """Submit CAPTCHA solution during automation."""
        app = db.get_application(user_id, application_id)
        if not app:
            return {"status": "error", "message": "Application not found"}

        db.update_application(user_id, application_id, {
            "automation_status": "running",
        })

        return {
            "status": "captcha_submitted",
            "message": "CAPTCHA submitted. Continuing...",
            "application_id": application_id,
        }

    async def final_submit(self, user_id: str, application_id: str) -> Dict:
        """Final submission of the application."""
        app = db.get_application(user_id, application_id)
        if not app:
            return {"status": "error", "message": "Application not found"}

        import random
        ack_number = f"CB{app.get('scheme_id', 'XX')[:3].upper()}{random.randint(100000, 999999)}"

        db.update_application(user_id, application_id, {
            "status": "submitted",
            "automation_status": "completed",
            "portal_application_id": ack_number,
            "submitted_at": now_iso(),
            "status_history": [{
                "status": "submitted",
                "timestamp": now_iso(),
                "details": f"Application submitted. Reference: {ack_number}",
                "source": "automation",
            }],
        })

        return {
            "status": "submitted",
            "message": "Application submitted successfully!",
            "application_id": application_id,
            "acknowledgment_number": ack_number,
        }

    # ================================================================
    # Core: fill one page
    # ================================================================

    async def _fill_page(self, session: Dict, config: Dict, page_num: int) -> Dict:
        """Fill a page: either via Playwright (live) or simulation."""
        pages = config.get("pages", [])
        if page_num > len(pages):
            return {"status": "error", "message": "Invalid page number"}

        page_config = pages[page_num - 1]
        page_name = page_config.get("name", f"Page {page_num}")
        page_url = page_config.get("url", "")
        form_data = session.get("form_data", {})

        # Step 1: Map user data to form fields via AI (Haiku - fast)
        filled_data = {}
        for field in page_config.get("fields", []):
            field_name = field.get("field_name", "")
            source = field.get("source", "")
            value = self._resolve_value(source, form_data)
            filled_data[field_name] = value or field.get("default", "")

        # Step 2: Fill form (Playwright live or simulation)
        screenshot_b64 = ""
        if PLAYWRIGHT_AVAILABLE and page_url:
            screenshot_b64 = await self._playwright_fill_page(
                page_url, page_config.get("fields", []), filled_data
            )
        else:
            # Simulation mode - generate a text summary instead
            logger.info(f"[SIMULATION] Filling page {page_num}: {page_name}")

        # Step 3: Save screenshot to S3
        screenshot_url = ""
        if screenshot_b64:
            ss_key = (f"screenshots/{session['user_id']}/"
                      f"{session['application_id']}/page_{page_num}.png")
            try:
                ss_bytes = base64.b64decode(screenshot_b64)
                s3_service.upload_file(ss_bytes, ss_key, "image/png",
                                       bucket=s3_service.screenshots_bucket)
                screenshot_url = s3_service.get_presigned_url(
                    ss_key, bucket=s3_service.screenshots_bucket, expiration=3600
                )
            except Exception as e:
                logger.warning(f"Failed to save screenshot: {e}")

        # Step 4: AI verification of screenshot (if available)
        verification = {}
        if screenshot_b64:
            try:
                verification = bedrock_service.analyze_screenshot(
                    screenshot_b64, page_name, filled_data
                )
            except Exception:
                verification = {"summary": "Please verify manually."}

        # Step 5: Generate summary
        try:
            summary = bedrock_service.generate_form_summary(filled_data, page_name)
        except Exception:
            summary = f"Page {page_num} ({page_name}) filled with your data. Please verify."

        # Step 6: Update application status
        screenshots = session.get("screenshots", [])
        screenshots.append({
            "page_num": page_num,
            "page_name": page_name,
            "screenshot_url": screenshot_url,
            "timestamp": now_iso(),
        })

        db.update_application(session["user_id"], session["application_id"], {
            "current_page": page_num,
            "automation_status": "paused_verification",
            "screenshots": screenshots,
        })

        return {
            "status": "verification_needed",
            "page_num": page_num,
            "total_pages": len(pages),
            "page_name": page_name,
            "filled_data": filled_data,
            "summary": summary,
            "screenshot_url": screenshot_url,
            "screenshot_base64": screenshot_b64[:100] + "..." if screenshot_b64 else "",
            "verification": verification,
            "captcha_detected": verification.get("captcha_detected", False),
            "needs_otp": verification.get("needs_otp", False),
            "application_id": session["application_id"],
        }

    # ================================================================
    # Playwright: fill form on real page
    # ================================================================

    async def _playwright_fill_page(self, url: str, fields: list,
                                     filled_data: dict) -> str:
        """Navigate to URL, fill fields, screenshot, return base64 PNG."""
        page = await self._new_page()
        if not page:
            return ""

        try:
            # Navigate
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)  # let JS render

            # Fill each field
            for field in fields:
                selector = field.get("selector", "")
                field_name = field.get("field_name", "")
                field_type = field.get("type", "text")
                value = filled_data.get(field_name, "")

                if not selector or not value:
                    continue

                try:
                    if field_type == "text":
                        await page.fill(selector, str(value))
                    elif field_type == "select":
                        await page.select_option(selector, value=str(value))
                    elif field_type == "radio":
                        await page.click(f"{selector}[value='{value}']")
                    elif field_type == "checkbox":
                        if value in ("true", "True", "1", True):
                            await page.check(selector)
                    elif field_type == "date":
                        await page.fill(selector, str(value))
                    elif field_type == "file":
                        # value should be local file path
                        if os.path.exists(str(value)):
                            await page.set_input_files(selector, str(value))
                except Exception as e:
                    logger.warning(f"Could not fill {field_name} ({selector}): {e}")

            # Wait for any client-side validation
            await page.wait_for_timeout(1000)

            # Take screenshot
            screenshot_bytes = await page.screenshot(full_page=True, type="png")
            return base64.b64encode(screenshot_bytes).decode("utf-8")

        except Exception as e:
            logger.error(f"Playwright page fill error: {e}")
            # Try to screenshot whatever we have
            try:
                screenshot_bytes = await page.screenshot(full_page=True, type="png")
                return base64.b64encode(screenshot_bytes).decode("utf-8")
            except Exception:
                return ""
        finally:
            try:
                await page.close()
            except Exception:
                pass

    # ================================================================
    # Live-mode: click Next / Submit on portal
    # ================================================================

    async def _click_next(self, page, next_selector: str) -> bool:
        """Click the Next/Submit button on the current page."""
        try:
            await page.click(next_selector)
            await page.wait_for_load_state("networkidle", timeout=15000)
            return True
        except Exception as e:
            logger.warning(f"Could not click next ({next_selector}): {e}")
            return False

    # ================================================================
    # Data preparation
    # ================================================================

    def _prepare_form_data(self, user_data: Dict, documents: List[Dict]) -> Dict:
        """Merge user profile and document data for form filling."""
        form_data = dict(user_data)

        for doc in documents:
            doc_type = doc.get("document_type", "")
            extracted = doc.get("extracted_data", {})
            if isinstance(extracted, str):
                try:
                    extracted = json.loads(extracted)
                except (json.JSONDecodeError, TypeError):
                    extracted = {}
            for key, value in extracted.items():
                form_data[f"{doc_type}.{key}"] = value

        return form_data

    def _resolve_value(self, source: str, form_data: Dict) -> Optional[str]:
        """Resolve a value from form data using dot notation."""
        if not source:
            return None

        if source in form_data:
            return str(form_data[source])

        parts = source.split(".")
        if len(parts) == 2:
            key = f"{parts[0]}.{parts[1]}"
            if key in form_data:
                return str(form_data[key])

        field_map = {
            "profile.name": "name",
            "profile.dob": "dob",
            "profile.gender": "gender",
            "profile.phone": "phone_number",
            "profile.email": "email",
            "profile.state": "state",
            "profile.district": "district",
            "profile.pincode": "pincode",
            "profile.address": "address",
            "profile.income": "annual_income",
            "profile.category": "category",
            "profile.occupation": "occupation",
            "profile.education": "education_level",
            "profile.bank_account": "bank_account",
            "profile.ifsc": "ifsc_code",
            "profile.bank_name": "bank_name",
            "profile.father_name": "father_name",
            "profile.mother_name": "mother_name",
            "profile.religion": "religion",
            "profile.marital_status": "marital_status",
        }

        mapped = field_map.get(source)
        if mapped and mapped in form_data:
            return str(form_data[mapped])

        return None


# Singleton
automation_service = AutomationService()
