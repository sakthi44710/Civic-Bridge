"""
Seed Script — Scrape myScheme.gov.in and load into DynamoDB

Strategy:
  1. Open myscheme.gov.in/search with Playwright headless
  2. Intercept XHR/fetch to discover the internal API URL
  3. Paginate with httpx (much faster than browser clicks)
  4. Normalise every scheme into a flat DynamoDB-ready dict
  5. Save a local JSON backup at data/scraped_schemes.json
  6. Batch-write to DynamoDB table (civic-bridge-schemes)

Run:
    cd backend
    python scripts/seed_schemes.py          # scrape + seed
    python scripts/seed_schemes.py --local  # seed from existing backup only
"""
import json
import os
import re
import sys
import time
import hashlib
import argparse
from typing import Dict, List, Optional
from decimal import Decimal

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from playwright.sync_api import sync_playwright

# ── paths ───────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
BACKUP_FILE = os.path.join(DATA_DIR, "scraped_schemes.json")

# myScheme search page (Next.js SSR — loads scheme list via internal API)
MYSCHEME_SEARCH_URL = "https://www.myscheme.gov.in/search"

# ── category mapping ───────────────────────────────────────────────
_CATEGORY_MAP = {
    "agriculture": "agriculture",
    "education": "education",
    "health": "health",
    "housing": "housing",
    "pension": "pension",
    "social welfare": "welfare",
    "welfare": "welfare",
    "women": "welfare",
    "child": "welfare",
    "labour": "welfare",
    "employment": "welfare",
    "skill": "education",
    "scholarship": "education",
    "insurance": "health",
    "financial": "welfare",
    "rural": "welfare",
    "urban": "housing",
    "utility & sanitation": "welfare",
    "transport": "welfare",
    "sports": "welfare",
    "science": "education",
    "business": "welfare",
}


def _map_category(tags: List[str]) -> str:
    """Map myScheme tags to our SchemeCategory enum."""
    for tag in tags:
        key = tag.strip().lower()
        if key in _CATEGORY_MAP:
            return _CATEGORY_MAP[key]
    return "welfare"  # default


def _stable_id(name: str) -> str:
    """Generate a stable, deterministic scheme_id from scheme name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]
    short_hash = hashlib.md5(name.encode()).hexdigest()[:6]
    return f"{slug}-{short_hash}"


# ── Step 1: Discover the internal API URL via Playwright ────────────
def discover_api_url(timeout_ms: int = 30000) -> Optional[str]:
    """
    Open the myScheme search page and intercept the XHR that
    fetches scheme data.  Return the base API URL (without page params).
    """
    api_url: Optional[str] = None

    def _on_response(response):
        nonlocal api_url
        url = response.url
        # The search page fetches scheme list from an internal API
        if "api" in url and ("scheme" in url.lower() or "search" in url.lower()):
            if response.status == 200:
                try:
                    body = response.json()
                    # Heuristic: response has 'data' array or is itself a list
                    if isinstance(body, list) or (isinstance(body, dict) and
                            any(k in body for k in ("data", "records", "schemes", "results"))):
                        api_url = url.split("?")[0]  # base without query params
                        print(f"  ✓ Discovered API: {api_url}")
                except Exception:
                    pass

    print("⏳ Launching headless browser to discover API endpoint …")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        page = ctx.new_page()
        page.on("response", _on_response)
        try:
            page.goto(MYSCHEME_SEARCH_URL, wait_until="networkidle", timeout=timeout_ms)
            # Scroll down to trigger lazy-loaded requests
            for _ in range(3):
                page.mouse.wheel(0, 1500)
                page.wait_for_timeout(1500)
        except Exception as e:
            print(f"  ⚠ Page load issue: {e}")
        finally:
            browser.close()

    return api_url


# ── Step 2: Paginate the API with httpx ─────────────────────────────
def fetch_all_schemes(api_url: str, max_pages: int = 200) -> List[Dict]:
    """
    Paginate the discovered API endpoint.
    Tries common pagination params: page, offset, skip, limit.
    """
    all_schemes: List[Dict] = []
    seen_ids: set = set()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": MYSCHEME_SEARCH_URL,
    }

    print(f"⏳ Fetching schemes from API ({api_url}) …")

    with httpx.Client(timeout=30, headers=headers, follow_redirects=True) as client:
        for page_num in range(1, max_pages + 1):
            # Try common pagination patterns
            params = {"page": page_num, "limit": 50}
            try:
                resp = client.get(api_url, params=params)
                resp.raise_for_status()
                body = resp.json()
            except Exception as e:
                print(f"  ⚠ Page {page_num} error: {e}")
                break

            # Extract scheme list from response (handle varying shapes)
            records = []
            if isinstance(body, list):
                records = body
            elif isinstance(body, dict):
                for key in ("data", "records", "schemes", "results", "items"):
                    if key in body and isinstance(body[key], list):
                        records = body[key]
                        break

            if not records:
                print(f"  ✓ No more records at page {page_num}")
                break

            new_count = 0
            for raw in records:
                scheme = _normalise(raw)
                if scheme and scheme["scheme_id"] not in seen_ids:
                    seen_ids.add(scheme["scheme_id"])
                    all_schemes.append(scheme)
                    new_count += 1

            print(f"  Page {page_num}: {new_count} new schemes (total: {len(all_schemes)})")

            if new_count == 0:
                break

            time.sleep(0.3)  # be respectful

    return all_schemes


# ── Fallback scraper (HTML parsing) ─────────────────────────────────
def scrape_with_browser(max_schemes: int = 3000) -> List[Dict]:
    """
    Fallback: scroll through the search page in Playwright and
    extract scheme cards from the DOM.
    """
    print("⏳ Falling back to browser-based scraping …")
    all_schemes: List[Dict] = []
    seen: set = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        )
        page = ctx.new_page()
        try:
            page.goto(MYSCHEME_SEARCH_URL, wait_until="networkidle", timeout=60000)
        except Exception as e:
            print(f"  ⚠ Page load issue: {e}")

        prev_count = 0
        stale_rounds = 0
        while len(all_schemes) < max_schemes and stale_rounds < 10:
            # Extract scheme cards from the page
            cards = page.query_selector_all("[class*='scheme'], [class*='card'], [data-scheme]")
            if not cards:
                # Try generic link approach
                cards = page.query_selector_all("a[href*='/scheme/']")

            for card in cards:
                try:
                    name = ""
                    href = ""

                    # Try to get the link and name
                    link = card.query_selector("a[href*='/scheme/']") or card
                    href = link.get_attribute("href") or ""
                    name = link.inner_text().strip().split("\n")[0]

                    if not name or name in seen:
                        continue
                    seen.add(name)

                    description = ""
                    desc_el = card.query_selector("p, [class*='desc']")
                    if desc_el:
                        description = desc_el.inner_text().strip()

                    scheme = {
                        "scheme_id": _stable_id(name),
                        "name": name,
                        "description": description or name,
                        "category": "welfare",
                        "status": "active",
                        "source": "myscheme.gov.in",
                        "application_url": f"https://www.myscheme.gov.in{href}" if href.startswith("/") else href,
                    }
                    all_schemes.append(scheme)
                except Exception:
                    continue

            if len(all_schemes) == prev_count:
                stale_rounds += 1
            else:
                stale_rounds = 0
            prev_count = len(all_schemes)

            # Scroll down to load more
            page.mouse.wheel(0, 2000)
            page.wait_for_timeout(2000)

            # Try clicking "Load More" or "Next" buttons
            for selector in ["button:has-text('Load More')", "button:has-text('Next')",
                             "[class*='next']", "[class*='load-more']"]:
                try:
                    btn = page.query_selector(selector)
                    if btn and btn.is_visible():
                        btn.click()
                        page.wait_for_timeout(2000)
                        break
                except Exception:
                    continue

        browser.close()

    print(f"  ✓ Scraped {len(all_schemes)} schemes from browser")
    return all_schemes


# ── Normalise a raw API record ──────────────────────────────────────
def _normalise(raw: Dict) -> Optional[Dict]:
    """Convert a raw myScheme record into our DynamoDB schema."""
    # Handle various field names the API might use
    name = (raw.get("schemeName") or raw.get("name") or
            raw.get("title") or raw.get("scheme_name") or "").strip()
    if not name:
        return None

    scheme_id_raw = raw.get("id") or raw.get("schemeId") or raw.get("scheme_id") or ""
    scheme_id = str(scheme_id_raw) if scheme_id_raw else _stable_id(name)

    description = (raw.get("briefDescription") or raw.get("description") or
                   raw.get("brief_description") or raw.get("overview") or name)

    tags = raw.get("tags") or raw.get("categories") or raw.get("schemeCategory") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]

    category = _map_category(tags)

    # State / location
    state = raw.get("state") or raw.get("stateName") or raw.get("location") or "Central"
    if isinstance(state, list):
        state = state[0] if state else "Central"

    # Ministry
    ministry = (raw.get("nodalMinistry") or raw.get("ministry") or
                raw.get("department") or raw.get("nodal_ministry") or "")

    # Benefits
    benefit_desc = (raw.get("benefitDescription") or raw.get("benefits") or
                    raw.get("benefit") or "")
    benefit_amount = _extract_amount(benefit_desc) or _extract_amount(description)

    # Application URL
    slug = raw.get("slug") or ""
    if slug:
        app_url = f"https://www.myscheme.gov.in/schemes/{slug}"
    else:
        app_url = raw.get("applicationUrl") or raw.get("application_url") or ""

    # Required documents
    docs = raw.get("documents") or raw.get("requiredDocuments") or raw.get("required_documents") or []
    if isinstance(docs, str):
        docs = [d.strip() for d in docs.split(",")]

    # Eligibility
    eligibility = raw.get("eligibility") or raw.get("eligibilityCriteria") or raw.get("eligibility_criteria") or {}
    if isinstance(eligibility, str):
        eligibility = {"description": eligibility}

    return {
        "scheme_id": scheme_id,
        "name": name,
        "description": str(description)[:2000],  # DynamoDB item size guard
        "category": category,
        "state": str(state),
        "ministry": str(ministry),
        "status": "active",
        "benefit_description": str(benefit_desc)[:1000] if benefit_desc else "",
        "benefit_amount": benefit_amount,
        "application_url": str(app_url),
        "required_documents": docs if isinstance(docs, list) else [],
        "eligibility_criteria": eligibility if isinstance(eligibility, dict) else {},
        "tags": tags if isinstance(tags, list) else [],
        "source": "myscheme.gov.in",
        "source_id": str(scheme_id_raw) if scheme_id_raw else "",
    }


def _extract_amount(text: str) -> int:
    """Try to pull a numeric rupee amount from a string."""
    if not text:
        return 0
    # Match patterns like ₹6,000 or Rs. 5,00,000 or 6000
    matches = re.findall(r"(?:₹|rs\.?\s*)([\d,]+(?:\.\d+)?)", str(text), re.IGNORECASE)
    if not matches:
        matches = re.findall(r"([\d,]+)\s*(?:rupee|per\s+(?:month|year|annum))", str(text), re.IGNORECASE)
    if matches:
        try:
            return int(matches[0].replace(",", "").split(".")[0])
        except (ValueError, IndexError):
            pass
    return 0


# ── Step 3: Save local backup ──────────────────────────────────────
def save_backup(schemes: List[Dict]) -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        json.dump(schemes, f, indent=2, ensure_ascii=False, default=str)
    print(f"✓ Backup saved: {BACKUP_FILE} ({len(schemes)} schemes)")
    return BACKUP_FILE


def load_backup() -> List[Dict]:
    if not os.path.exists(BACKUP_FILE):
        print(f"✗ No backup file at {BACKUP_FILE}")
        return []
    with open(BACKUP_FILE, "r", encoding="utf-8") as f:
        schemes = json.load(f)
    print(f"✓ Loaded {len(schemes)} schemes from backup")
    return schemes


# ── Step 4: Batch-write to DynamoDB ─────────────────────────────────
def seed_dynamodb(schemes: List[Dict]):
    """Write schemes to DynamoDB using batch_writer for efficiency."""
    from app.services.aws_clients import aws
    from app.config import settings

    table = aws.dynamodb().Table(settings.SCHEMES_TABLE)
    written = 0
    errors = 0

    print(f"⏳ Seeding {len(schemes)} schemes into DynamoDB ({settings.SCHEMES_TABLE}) …")

    with table.batch_writer() as batch:
        for scheme in schemes:
            try:
                # Convert floats to Decimal for DynamoDB
                item = _convert_for_dynamo(scheme)
                batch.put_item(Item=item)
                written += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  ⚠ Error writing {scheme.get('scheme_id')}: {e}")

    print(f"✓ DynamoDB: {written} written, {errors} errors")


def _convert_for_dynamo(obj):
    """Recursively convert floats to Decimals (DynamoDB requirement)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _convert_for_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_for_dynamo(i) for i in obj]
    return obj


# ── Main ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Scrape myScheme.gov.in → seed DynamoDB")
    parser.add_argument("--local", action="store_true",
                        help="Skip scraping, seed from existing backup file")
    parser.add_argument("--backup-only", action="store_true",
                        help="Scrape and save backup but don't write to DynamoDB")
    parser.add_argument("--max-pages", type=int, default=200,
                        help="Maximum API pages to fetch")
    args = parser.parse_args()

    if args.local:
        schemes = load_backup()
        if not schemes:
            print("✗ No backup found. Run without --local first.")
            sys.exit(1)
    else:
        # Step 1: Discover API
        api_url = discover_api_url()

        if api_url:
            # Step 2: Paginate API
            schemes = fetch_all_schemes(api_url, max_pages=args.max_pages)
        else:
            print("  ⚠ Could not discover API — falling back to browser scraping")
            schemes = scrape_with_browser()

        if not schemes:
            print("✗ No schemes scraped. Check network / myscheme.gov.in availability.")
            sys.exit(1)

        # Step 3: Backup
        save_backup(schemes)

    print(f"\n{'═' * 50}")
    print(f"  Total schemes: {len(schemes)}")
    print(f"  Categories: {sorted(set(s.get('category','?') for s in schemes))}")
    print(f"  States: {len(set(s.get('state','?') for s in schemes))} unique")
    print(f"{'═' * 50}\n")

    if not args.backup_only:
        seed_dynamodb(schemes)

    print("✅ Done!")


if __name__ == "__main__":
    main()
