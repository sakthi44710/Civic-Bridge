"""
AWS Comprehend Service - Entity Extraction (NER)
"""
import logging
from typing import Dict, List
from botocore.exceptions import ClientError
from app.services.aws_clients import aws

logger = logging.getLogger(__name__)


class ComprehendService:
    """AWS Comprehend for entity extraction from documents"""
    
    def __init__(self):
        self.client = aws.comprehend()
    
    def extract_entities(self, text: str, language: str = "en") -> Dict:
        """Extract named entities from text"""
        # Comprehend supports: en, es, fr, de, it, pt, ar, hi, ja, ko, zh, zh-TW
        supported_langs = ["en", "hi", "ar"]
        lang_code = language if language in supported_langs else "en"
        
        try:
            response = self.client.detect_entities(
                Text=text[:5000],  # Max 5000 bytes
                LanguageCode=lang_code
            )
            
            entities = {}
            for entity in response.get("Entities", []):
                entity_type = entity["Type"]
                if entity_type not in entities:
                    entities[entity_type] = []
                entities[entity_type].append({
                    "text": entity["Text"],
                    "score": round(entity["Score"], 3),
                    "begin_offset": entity["BeginOffset"],
                    "end_offset": entity["EndOffset"]
                })
            
            return {
                "entities": entities,
                "entity_count": len(response.get("Entities", [])),
                "types_found": list(entities.keys())
            }
        except ClientError as e:
            logger.error(f"Comprehend entity extraction error: {e}")
            return {"entities": {}, "entity_count": 0, "types_found": []}
    
    def detect_language(self, text: str) -> Dict:
        """Detect dominant language of text"""
        try:
            response = self.client.detect_dominant_language(
                Text=text[:5000]
            )
            
            languages = []
            for lang in response.get("Languages", []):
                languages.append({
                    "code": lang["LanguageCode"],
                    "score": round(lang["Score"], 3)
                })
            
            dominant = languages[0] if languages else {"code": "en", "score": 0.0}
            return {
                "dominant_language": dominant["code"],
                "confidence": dominant["score"],
                "all_languages": languages
            }
        except ClientError as e:
            logger.error(f"Language detection error: {e}")
            return {"dominant_language": "en", "confidence": 0.0, "all_languages": []}
    
    def detect_sentiment(self, text: str, language: str = "en") -> Dict:
        """Detect sentiment of text"""
        try:
            response = self.client.detect_sentiment(
                Text=text[:5000],
                LanguageCode=language if language in ["en", "hi", "ar"] else "en"
            )
            return {
                "sentiment": response.get("Sentiment", "NEUTRAL"),
                "scores": response.get("SentimentScore", {})
            }
        except ClientError as e:
            logger.error(f"Sentiment detection error: {e}")
            return {"sentiment": "NEUTRAL", "scores": {}}
    
    def extract_key_phrases(self, text: str, language: str = "en") -> List[Dict]:
        """Extract key phrases from text"""
        try:
            response = self.client.detect_key_phrases(
                Text=text[:5000],
                LanguageCode=language if language in ["en", "hi", "ar"] else "en"
            )
            return [
                {"text": kp["Text"], "score": round(kp["Score"], 3)}
                for kp in response.get("KeyPhrases", [])
            ]
        except ClientError as e:
            logger.error(f"Key phrase extraction error: {e}")
            return []


# Singleton
comprehend_service = ComprehendService()
