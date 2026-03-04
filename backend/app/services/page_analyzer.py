"""
Page Analyzer — AI-driven web page understanding for form automation.

This service takes a Playwright page and uses Bedrock AI to:
  1. Extract all visible form fields with their CSS selectors, labels, and types
  2. Detect navigation buttons (Next, Submit, Continue)
  3. Detect OTP/CAPTCHA areas
  4. Classify the page type (login, form, otp, captcha, confirmation, error)
  5. Map collected user data to discovered page fields

This makes the form agent work on ANY government portal — no hardcoded selectors needed.
"""
import json
import logging
import re
from typing import Dict, List, Optional

from app.services.bedrock_service import bedrock_service

logger = logging.getLogger(__name__)

# ── Prompt: Analyze a web page's form structure ────────────────────────
PAGE_ANALYSIS_PROMPT = """You are an expert web page analyzer. Given the HTML of a web page, identify all form elements.

PAGE HTML (relevant sections):
{page_html}

Analyze the page and return a JSON object with:

{{
  "page_type": "login|registration|application_form|otp_verification|captcha|confirmation|error|info|other",
  "page_title": "visible page title or heading",
  "fields": [
    {{
      "selector": "CSS selector to target this element (prefer #id, then name, then specific class)",
      "label": "human-readable label for this field",
      "field_name": "normalized snake_case name (e.g. full_name, mobile_number, date_of_birth)",
      "type": "text|email|tel|number|date|select|radio|checkbox|textarea|password|file",
      "required": true,
      "placeholder": "placeholder text if any",
      "options": ["option1", "option2"]
    }}
  ],
  "buttons": [
    {{
      "selector": "CSS selector for the button",
      "text": "button text",
      "type": "submit|next|login|verify|cancel|back|register"
    }}
  ],
  "has_otp": false,
  "has_captcha": false,
  "captcha_image_selector": null,
  "login_required": false,
  "notes": "any important observations about the page"
}}

Rules:
- Only include VISIBLE form fields (skip hidden inputs unless they are important like CSRF tokens)
- For selectors, prefer: #id > [name="..."] > specific CSS path
- Normalize field_name to snake_case matching common Indian govt form fields
- Common field mappings: applicant name → full_name, father's name → father_name, DOB → date_of_birth, Aadhaar → aadhaar_number, mobile/phone → mobile_number, email → email, state → state, district → district, pin → pincode
- If a select has options, list the first 10 option values
- Detect if the page is a login page (has username/password fields)
- Detect if OTP input is present
- Detect CAPTCHA image and input"""

# ── Prompt: Map user data to page fields ──────────────────────────────
FIELD_MAPPING_PROMPT = """You are a form field mapping agent. Map the user's collected data to the page's form fields.

User's collected data:
{user_data}

Page form fields (with selectors):
{page_fields}

Return a JSON object mapping each fillable field to its value:
{{
  "mappings": [
    {{
      "selector": "CSS selector from page fields",
      "value": "value from user data to fill",
      "field_name": "the field name from user data",
      "type": "text|select|radio|checkbox|date"
    }}
  ],
  "unmapped_fields": ["field labels that have no matching user data"],
  "unmapped_data": ["user data keys that don't match any page field"]
}}

Rules:
- Match fields by semantic meaning, not just exact name match
- "full_name" / "applicant_name" / "name" all map to name fields
- For select fields, match the option value or label closest to the user's data
- For date fields in DD/MM/YYYY format, reformat if the field expects a different format
- Handle Indian state names and categories (SC/ST/OBC/General)
- Only map fields where you are confident of the match
- Include ALL unmapped fields so the voice AI can ask the user"""


class PageAnalyzer:
    """Analyzes web pages using AI to discover form fields and navigation."""

    @staticmethod
    def extract_page_html(page) -> str:
        """Extract relevant HTML from a Playwright page, stripped of noise.
        Keeps form-related elements and visible text, removes scripts/styles.
        NOTE: This is sync — called from the Playwright executor thread."""
        try:
            html = page.evaluate("""() => {
                // Remove script and style tags to reduce noise
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, noscript, svg, link, meta').forEach(el => el.remove());
                
                // Get all forms
                const forms = clone.querySelectorAll('form');
                if (forms.length > 0) {
                    // Return form HTML with context
                    let result = '';
                    // Get page title
                    const title = document.title || '';
                    const h1 = document.querySelector('h1')?.textContent || '';
                    result += '<context>' + title + ' | ' + h1 + '</context>\\n';
                    
                    forms.forEach((form, i) => {
                        result += '<form data-index="' + i + '">' + form.innerHTML + '</form>\\n';
                    });
                    return result;
                }
                
                // No <form> tags — look for input elements directly
                const inputs = clone.querySelectorAll('input, select, textarea, button[type="submit"]');
                if (inputs.length > 0) {
                    let result = '<context>' + (document.title || '') + '</context>\\n';
                    // Get parent containers of inputs for label context
                    const containers = new Set();
                    inputs.forEach(input => {
                        let parent = input.parentElement;
                        for (let i = 0; i < 3 && parent; i++) parent = parent.parentElement || parent;
                        containers.add(parent);
                    });
                    containers.forEach(c => {
                        if (c) result += c.outerHTML + '\\n';
                    });
                    return result;
                }
                
                // Fallback — return trimmed body text
                return '<context>' + (document.title || '') + '</context>\\n' + clone.innerHTML;
            }""")

            # Truncate to fit AI context window (~8000 chars)
            if len(html) > 8000:
                html = html[:8000] + "\n<!-- truncated -->"
            return html
        except Exception as e:
            logger.warning(f"Failed to extract page HTML: {e}")
            return ""

    @staticmethod
    def analyze_page(page) -> Dict:
        """Analyze a Playwright page and return structured field data.
        NOTE: This is sync — called from the Playwright executor thread.
        
        Returns:
            {
                "page_type": "application_form",
                "fields": [{"selector": ..., "label": ..., "type": ..., "field_name": ...}],
                "buttons": [{"selector": ..., "text": ..., "type": ...}],
                "has_otp": False,
                "has_captcha": False,
                ...
            }
        """
        html = PageAnalyzer.extract_page_html(page)
        if not html:
            return {"page_type": "error", "fields": [], "buttons": []}

        prompt = PAGE_ANALYSIS_PROMPT.format(page_html=html)

        try:
            raw = bedrock_service.chat_raw(prompt, max_tokens=2048, temperature=0.1)
            result = _parse_json_response(raw)
            if result and "fields" in result:
                logger.info(f"Page analysis: type={result.get('page_type')}, "
                            f"fields={len(result.get('fields', []))}, "
                            f"buttons={len(result.get('buttons', []))}")
                return result
        except Exception as e:
            logger.warning(f"Page analysis failed: {e}")

        return {"page_type": "unknown", "fields": [], "buttons": []}

    @staticmethod
    def map_data_to_fields(collected_data: Dict[str, str],
                            page_fields: List[Dict]) -> Dict:
        """Map user's collected data to the current page's form fields.
        NOTE: This is sync — called from the Playwright executor thread.
        
        Returns:
            {
                "mappings": [{"selector": ..., "value": ..., "type": ...}],
                "unmapped_fields": [...],
                "unmapped_data": [...]
            }
        """
        if not collected_data or not page_fields:
            return {"mappings": [], "unmapped_fields": [], "unmapped_data": []}

        user_data_str = json.dumps(collected_data, indent=2, ensure_ascii=False)
        fields_str = json.dumps(page_fields, indent=2, ensure_ascii=False)

        prompt = FIELD_MAPPING_PROMPT.format(
            user_data=user_data_str,
            page_fields=fields_str,
        )

        try:
            raw = bedrock_service.chat_raw(prompt, max_tokens=1024, temperature=0.1)
            result = _parse_json_response(raw)
            if result and "mappings" in result:
                logger.info(f"Field mapping: {len(result['mappings'])} mapped, "
                            f"{len(result.get('unmapped_fields', []))} unmapped")
                return result
        except Exception as e:
            logger.warning(f"Field mapping failed: {e}")

        return {"mappings": [], "unmapped_fields": [], "unmapped_data": []}

    @staticmethod
    def find_next_button(page) -> Optional[str]:
        """Find the 'Next' / 'Submit' / 'Continue' button on the current page.
        Uses direct DOM queries first, then falls back to AI analysis.
        NOTE: This is sync — called from the Playwright executor thread."""
        # Quick DOM-based detection (no AI call needed)
        button_patterns = [
            'button:has-text("Next")', 'button:has-text("Continue")',
            'button:has-text("Submit")', 'button:has-text("Proceed")',
            'button:has-text("आगे")',  # Hindi: Next
            'button:has-text("जमा करें")',  # Hindi: Submit
            'input[type="submit"]',
            'button[type="submit"]',
            'a:has-text("Next")', 'a:has-text("Continue")',
            '.btn-next', '.btn-submit', '#btnNext', '#btnSubmit',
            '#submitBtn', '#nextBtn',
        ]
        try:
            for selector in button_patterns:
                try:
                    elem = page.query_selector(selector)
                    if elem and elem.is_visible():
                        return selector
                except Exception:
                    pass
        except Exception:
            pass
        return None


# ── Helper ─────────────────────────────────────────────────────────────
def _parse_json_response(raw: str) -> Optional[Dict]:
    """Parse JSON from an AI response that may contain extra text."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Find JSON object in the response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
    return None


# Singleton
page_analyzer = PageAnalyzer()
