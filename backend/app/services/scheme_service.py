"""
Scheme Service — reads scraped myScheme.gov.in data from DynamoDB

Public API (called by ws.py tools + routes/schemes.py):
    search_schemes(query, category, state)  → List[Dict]
    get_scheme(scheme_id)                   → Optional[Dict]
    match_schemes(user_profile)             → List[Dict]
    check_eligibility(user_profile, scheme_id) → Dict
    list_categories()                       → List[Dict]
    get_all_schemes()                       → List[Dict]
    seed_schemes(schemes_data)              → None  (legacy compat)
"""
import json
import logging
import os
import re
from typing import Dict, List, Optional

from app.services.dynamodb_service import db
from app.services.bedrock_service import bedrock_service
from app.utils.helpers import calculate_age

logger = logging.getLogger(__name__)


class SchemeService:
    """Government scheme discovery and eligibility engine.
    
    Primary data source: DynamoDB table (seeded by scripts/seed_schemes.py).
    Fallback: local JSON files in data/ directory.
    """

    _local_cache: List[Dict] = []

    # ─── data access ────────────────────────────────────────────────

    def _load_local_schemes(self) -> List[Dict]:
        """Fallback: load from local JSON files when DynamoDB is unavailable."""
        if self._local_cache:
            return self._local_cache

        data_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data"
        )
        all_schemes: List[Dict] = []

        # Try scraped backup first
        scraped = os.path.join(data_dir, "scraped_schemes.json")
        if os.path.exists(scraped):
            try:
                with open(scraped, "r", encoding="utf-8") as f:
                    all_schemes = json.load(f)
                    self._local_cache = all_schemes
                    logger.info(f"Loaded {len(all_schemes)} schemes from scraped backup")
                    return all_schemes
            except Exception as e:
                logger.error(f"Error loading scraped backup: {e}")

        # Fall back to legacy seed files
        for filename in [
            "schemes_education.json", "schemes_healthcare.json",
            "schemes_agriculture.json", "schemes_welfare.json",
        ]:
            filepath = os.path.join(data_dir, filename)
            if os.path.exists(filepath):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        all_schemes.extend(json.load(f))
                except Exception as e:
                    logger.error(f"Error loading {filename}: {e}")

        self._local_cache = all_schemes
        logger.info(f"Loaded {len(all_schemes)} schemes from local files")
        return all_schemes

    def get_all_schemes(self) -> List[Dict]:
        """Get all active schemes."""
        try:
            schemes = db.get_all_schemes()
            if schemes:
                return schemes
        except Exception as e:
            logger.warning(f"DynamoDB unavailable: {e}")
        return self._load_local_schemes()

    def get_scheme(self, scheme_id: str) -> Optional[Dict]:
        """Get a single scheme by ID."""
        try:
            item = db.get_scheme(scheme_id)
            if item:
                return item
        except Exception:
            pass
        # Fallback: linear scan of local data
        for s in self._load_local_schemes():
            if s.get("scheme_id") == scheme_id:
                return s
        return None

    def get_schemes_by_category(self, category: str) -> List[Dict]:
        """Get schemes filtered by category."""
        try:
            items = db.get_schemes_by_category(category)
            if items:
                return items
        except Exception:
            pass
        return [s for s in self._load_local_schemes() if s.get("category") == category]

    # ─── search ─────────────────────────────────────────────────────

    def search_schemes(
        self,
        query: str = None,
        category: str = None,
        state: str = None,
    ) -> List[Dict]:
        """Search schemes by keyword, category, and/or state."""
        all_schemes = self.get_all_schemes()
        results: List[Dict] = []

        query_lower = query.lower().strip() if query else ""

        for scheme in all_schemes:
            if scheme.get("status") not in (None, "active"):
                continue

            # category filter
            if category and scheme.get("category") != category:
                continue

            # state filter — show Central + matching state schemes
            if state:
                s_state = (scheme.get("state") or "").lower()
                if s_state and s_state not in (state.lower(), "all", "central"):
                    continue

            # text search
            if query_lower:
                searchable = " ".join([
                    scheme.get("name", ""),
                    scheme.get("description", ""),
                    scheme.get("category", ""),
                    scheme.get("ministry", ""),
                    " ".join(scheme.get("tags", [])),
                ]).lower()
                if query_lower not in searchable:
                    continue

            results.append(scheme)

        # Sort by relevance (name match first) then alphabetically
        if query_lower:
            results.sort(
                key=lambda s: (0 if query_lower in s.get("name", "").lower() else 1, s.get("name", "")),
            )

        return results

    # ─── matching & eligibility ─────────────────────────────────────

    def match_schemes(self, user_profile: Dict) -> List[Dict]:
        """Match eligible schemes for a user profile."""
        all_schemes = self.get_all_schemes()
        matches: List[Dict] = []

        for scheme in all_schemes:
            if scheme.get("status") not in (None, "active"):
                continue

            result = self._check_eligibility(user_profile, scheme)
            if result["match_score"] > 0:
                matches.append({
                    "scheme_id": scheme.get("scheme_id"),
                    "name": scheme.get("name", ""),
                    "category": scheme.get("category", ""),
                    "benefit_amount": scheme.get("benefit_amount"),
                    "benefit_description": scheme.get("benefit_description", ""),
                    "match_score": result["match_score"],
                    "eligibility_status": result["status"],
                    "missing_info": result.get("missing_info", []),
                })

        matches.sort(key=lambda x: x["match_score"], reverse=True)
        return matches

    def check_eligibility(self, user_profile: Dict, scheme_id: str) -> Dict:
        """Check eligibility for a specific scheme, including AI analysis."""
        scheme = self.get_scheme(scheme_id)
        if not scheme:
            return {"eligible": False, "error": "Scheme not found"}

        result = self._check_eligibility(user_profile, scheme)

        # AI-enhanced analysis
        try:
            ai_result = bedrock_service.check_eligibility(user_profile, scheme)
            result["ai_analysis"] = ai_result
        except Exception as e:
            logger.error(f"AI eligibility check error: {e}")

        return result

    def _check_eligibility(self, user_profile: Dict, scheme: Dict) -> Dict:
        """Rule-based eligibility scoring."""
        criteria = scheme.get("eligibility_criteria", {})
        met: List[str] = []
        unmet: List[str] = []
        missing_info: List[str] = []
        score = 100

        # ── Age ──
        if criteria.get("min_age") or criteria.get("max_age"):
            dob = user_profile.get("dob")
            if dob:
                age = calculate_age(dob)
                if age is not None:
                    if criteria.get("min_age") and age < criteria["min_age"]:
                        unmet.append(f"Minimum age {criteria['min_age']} required (you are {age})")
                        score -= 50
                    elif criteria.get("max_age") and age > criteria["max_age"]:
                        unmet.append(f"Maximum age {criteria['max_age']} (you are {age})")
                        score -= 50
                    else:
                        met.append("Age requirement met")
            else:
                missing_info.append("date_of_birth")
                score -= 10

        # ── Income ──
        if criteria.get("max_income"):
            income = user_profile.get("annual_income")
            if income is not None:
                try:
                    if int(income) > int(criteria["max_income"]):
                        unmet.append(f"Income must be below ₹{criteria['max_income']}")
                        score -= 40
                    else:
                        met.append("Income requirement met")
                except (ValueError, TypeError):
                    missing_info.append("annual_income")
            else:
                missing_info.append("annual_income")
                score -= 10

        # ── Category (SC/ST/OBC/General) ──
        if criteria.get("categories"):
            cat = user_profile.get("category")
            if cat:
                if cat.lower() in [c.lower() for c in criteria["categories"]]:
                    met.append("Category eligible")
                else:
                    unmet.append(f"Category must be one of: {', '.join(criteria['categories'])}")
                    score -= 30
            else:
                missing_info.append("category")
                score -= 5

        # ── Gender ──
        if criteria.get("gender"):
            gender = user_profile.get("gender")
            if gender:
                if gender.lower() in [g.lower() for g in criteria["gender"]]:
                    met.append("Gender eligible")
                else:
                    unmet.append(f"This scheme is for {', '.join(criteria['gender'])} only")
                    score -= 50
            else:
                missing_info.append("gender")
                score -= 5

        # ── State ──
        if criteria.get("states"):
            st = user_profile.get("state")
            if st:
                if st.lower() in [s.lower() for s in criteria["states"]] or "all" in criteria["states"]:
                    met.append("State eligible")
                else:
                    unmet.append(f"This scheme is for: {', '.join(criteria['states'])}")
                    score -= 50
            else:
                missing_info.append("state")
                score -= 5

        # ── Education ──
        if criteria.get("education_level"):
            edu = user_profile.get("education_level")
            if edu:
                if edu.lower() in [e.lower() for e in criteria["education_level"]]:
                    met.append("Education level eligible")
                else:
                    score -= 20
            else:
                missing_info.append("education_level")
                score -= 5

        # ── State-level matching (when eligibility_criteria has no states
        #    but the scheme itself has a state field) ──
        scheme_state = (scheme.get("state") or "").lower()
        profile_state = (user_profile.get("state") or "").lower()
        if scheme_state and scheme_state not in ("central", "all", ""):
            if profile_state and profile_state != scheme_state:
                score -= 30

        score = max(0, score)
        status = (
            "eligible" if score >= 70 and not unmet
            else "likely_eligible" if score >= 40
            else "not_eligible"
        )

        return {
            "eligible": status == "eligible",
            "status": status,
            "match_score": score,
            "met_criteria": met,
            "unmet_criteria": unmet,
            "missing_info": missing_info,
        }

    # ─── categories ─────────────────────────────────────────────────

    def list_categories(self) -> List[Dict]:
        """Return the distinct categories present in the scheme data."""
        all_schemes = self.get_all_schemes()
        cats = sorted(set(s.get("category", "welfare") for s in all_schemes))
        icons = {
            "agriculture": "🌾", "education": "🎓", "health": "🏥",
            "housing": "🏠", "pension": "👴", "welfare": "🤝",
        }
        return [
            {"id": c, "name": c.title(), "icon": icons.get(c, "📋")}
            for c in cats
        ]

    # ─── seed (legacy compat — called by old seed script) ──────────

    def seed_schemes(self, schemes_data: List[Dict]):
        """Seed scheme data into DynamoDB."""
        for scheme in schemes_data:
            db.save_scheme(scheme)
        logger.info(f"Seeded {len(schemes_data)} schemes")


# Singleton
scheme_service = SchemeService()
