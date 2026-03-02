"""
Scheme Service - Scheme Discovery, Eligibility Matching, and Management
"""
import json
import logging
import os
from typing import Dict, List, Optional
from app.services.dynamodb_service import db
from app.services.bedrock_service import bedrock_service
from app.utils.helpers import calculate_age

logger = logging.getLogger(__name__)


class SchemeService:
    """Government scheme discovery and eligibility engine"""
    
    _local_schemes_cache: List[Dict] = []
    
    def _load_local_schemes(self) -> List[Dict]:
        """Load schemes from local JSON files when DynamoDB is unavailable"""
        if self._local_schemes_cache:
            return self._local_schemes_cache
        
        data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
        all_schemes = []
        
        for filename in ["schemes_education.json", "schemes_healthcare.json", 
                         "schemes_agriculture.json", "schemes_welfare.json"]:
            filepath = os.path.join(data_dir, filename)
            if os.path.exists(filepath):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        schemes = json.load(f)
                        all_schemes.extend(schemes)
                except Exception as e:
                    logger.error(f"Error loading {filename}: {e}")
        
        self._local_schemes_cache = all_schemes
        logger.info(f"Loaded {len(all_schemes)} schemes from local files")
        return all_schemes
    
    def get_all_schemes(self) -> List[Dict]:
        """Get all active schemes"""
        try:
            return db.get_all_schemes()
        except Exception as e:
            logger.warning(f"DynamoDB unavailable, loading from local files: {e}")
            return self._load_local_schemes()
    
    def get_scheme(self, scheme_id: str) -> Optional[Dict]:
        """Get scheme by ID"""
        try:
            return db.get_scheme(scheme_id)
        except Exception:
            # Fallback: search local schemes
            for scheme in self._load_local_schemes():
                if scheme.get("scheme_id") == scheme_id:
                    return scheme
            return None
    
    def get_schemes_by_category(self, category: str) -> List[Dict]:
        """Get schemes by category"""
        try:
            return db.get_schemes_by_category(category)
        except Exception:
            return [s for s in self._load_local_schemes() if s.get("category") == category]
    
    def search_schemes(self, query: str = None, category: str = None,
                       state: str = None) -> List[Dict]:
        """Search schemes by query, category, state"""
        all_schemes = self.get_all_schemes()
        results = []
        
        for scheme in all_schemes:
            if scheme.get("status") != "active":
                continue
            
            # Filter by category
            if category and scheme.get("category") != category:
                continue
            
            # Filter by state (show central + matching state schemes)
            if state:
                scheme_state = scheme.get("state")
                if scheme_state and scheme_state.lower() != state.lower() and scheme_state != "all":
                    continue
            
            # Filter by query (simple text match)
            if query:
                query_lower = query.lower()
                searchable = f"{scheme.get('name', '')} {scheme.get('description', '')} {scheme.get('category', '')}".lower()
                if query_lower not in searchable:
                    continue
            
            results.append(scheme)
        
        return results
    
    def match_schemes(self, user_profile: Dict) -> List[Dict]:
        """Match eligible schemes for user profile"""
        all_schemes = self.get_all_schemes()
        matches = []
        
        for scheme in all_schemes:
            if scheme.get("status") != "active":
                continue
            
            result = self._check_eligibility(user_profile, scheme)
            if result["match_score"] > 0:
                matches.append({
                    "scheme_id": scheme["scheme_id"],
                    "name": scheme.get("name", ""),
                    "category": scheme.get("category", ""),
                    "benefit_amount": scheme.get("benefit_amount"),
                    "benefit_description": scheme.get("benefit_description", ""),
                    "match_score": result["match_score"],
                    "eligibility_status": result["status"],
                    "missing_info": result.get("missing_info", []),
                })
        
        # Sort by match score
        matches.sort(key=lambda x: x["match_score"], reverse=True)
        return matches
    
    def check_eligibility(self, user_profile: Dict, scheme_id: str) -> Dict:
        """Check eligibility for a specific scheme"""
        scheme = self.get_scheme(scheme_id)
        if not scheme:
            return {"eligible": False, "error": "Scheme not found"}
        
        result = self._check_eligibility(user_profile, scheme)
        
        # Also use AI for detailed analysis
        try:
            ai_result = bedrock_service.check_eligibility(user_profile, scheme)
            result["ai_analysis"] = ai_result
        except Exception as e:
            logger.error(f"AI eligibility check error: {e}")
        
        return result
    
    def _check_eligibility(self, user_profile: Dict, scheme: Dict) -> Dict:
        """Rule-based eligibility check"""
        criteria = scheme.get("eligibility_criteria", {})
        met = []
        unmet = []
        missing_info = []
        score = 100
        
        # Age check
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
        
        # Income check
        if criteria.get("max_income"):
            income = user_profile.get("annual_income")
            if income is not None:
                try:
                    income_int = int(income)
                    if income_int > int(criteria["max_income"]):
                        unmet.append(f"Income must be below ₹{criteria['max_income']}")
                        score -= 40
                    else:
                        met.append("Income requirement met")
                except (ValueError, TypeError):
                    missing_info.append("annual_income")
            else:
                missing_info.append("annual_income")
                score -= 10
        
        # Category check
        if criteria.get("categories"):
            category = user_profile.get("category")
            if category:
                if category.lower() in [c.lower() for c in criteria["categories"]]:
                    met.append("Category eligible")
                else:
                    unmet.append(f"Category must be one of: {', '.join(criteria['categories'])}")
                    score -= 30
            else:
                missing_info.append("category")
                score -= 5
        
        # Gender check
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
        
        # State check
        if criteria.get("states"):
            state = user_profile.get("state")
            if state:
                if state.lower() in [s.lower() for s in criteria["states"]] or "all" in criteria["states"]:
                    met.append("State eligible")
                else:
                    unmet.append(f"This scheme is for: {', '.join(criteria['states'])}")
                    score -= 50
            else:
                missing_info.append("state")
                score -= 5
        
        # Education check
        if criteria.get("education_level"):
            education = user_profile.get("education_level")
            if education:
                if education.lower() in [e.lower() for e in criteria["education_level"]]:
                    met.append("Education level eligible")
                else:
                    score -= 20
            else:
                missing_info.append("education_level")
                score -= 5
        
        score = max(0, score)
        status = "eligible" if score >= 70 and not unmet else "likely_eligible" if score >= 40 else "not_eligible"
        
        return {
            "eligible": status == "eligible",
            "status": status,
            "match_score": score,
            "met_criteria": met,
            "unmet_criteria": unmet,
            "missing_info": missing_info,
        }
    
    def seed_schemes(self, schemes_data: List[Dict]):
        """Seed scheme data into DynamoDB"""
        for scheme in schemes_data:
            db.save_scheme(scheme)
        logger.info(f"Seeded {len(schemes_data)} schemes")


# Singleton
scheme_service = SchemeService()
