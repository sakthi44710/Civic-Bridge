"""
AWS Translate Service - Language Translation for 22 Indian Languages
"""
import logging
from typing import Dict
from botocore.exceptions import ClientError
from app.services.aws_clients import aws

logger = logging.getLogger(__name__)

# AWS Translate supported Indian language codes
TRANSLATE_LANGUAGES = {
    "en": "en", "hi": "hi", "ta": "ta", "te": "te", "bn": "bn",
    "mr": "mr", "gu": "gu", "kn": "kn", "ml": "ml", "or": "or",
    "pa": "pa", "ur": "ur", "as": "as", "ne": "ne",
    # Unsupported by Translate - pass through
    "mai": None, "sat": None, "ks": None, "kok": None,
    "sd": None, "doi": None, "mni": None, "brx": None, "sa": None,
}

LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu",
    "bn": "Bengali", "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada",
    "ml": "Malayalam", "or": "Odia", "pa": "Punjabi", "ur": "Urdu",
    "as": "Assamese", "ne": "Nepali", "mai": "Maithili", "sat": "Santali",
    "ks": "Kashmiri", "kok": "Konkani", "sd": "Sindhi", "doi": "Dogri",
    "mni": "Manipuri", "brx": "Bodo", "sa": "Sanskrit",
}


class TranslateService:
    """AWS Translate for multilingual support"""
    
    def __init__(self):
        self.client = aws.translate_client()
    
    def translate(self, text: str, source_lang: str = "auto",
                  target_lang: str = "en") -> Dict:
        """Translate text between languages"""
        source_code = TRANSLATE_LANGUAGES.get(source_lang, source_lang)
        target_code = TRANSLATE_LANGUAGES.get(target_lang, target_lang)
        
        # If language not supported by Translate, return original
        if source_code is None or target_code is None:
            return {
                "translated_text": text,
                "source_language": source_lang,
                "target_language": target_lang,
                "is_fallback": True
            }
        
        if source_lang == "auto":
            source_code = "auto"
        
        try:
            response = self.client.translate_text(
                Text=text[:5000],
                SourceLanguageCode=source_code,
                TargetLanguageCode=target_code
            )
            
            return {
                "translated_text": response["TranslatedText"],
                "source_language": response["SourceLanguageCode"],
                "target_language": response["TargetLanguageCode"],
                "is_fallback": False
            }
        except ClientError as e:
            logger.error(f"Translation error: {e}")
            return {
                "translated_text": text,
                "source_language": source_lang,
                "target_language": target_lang,
                "is_fallback": True,
                "error": str(e)
            }
    
    def translate_batch(self, texts: list, source_lang: str, 
                        target_lang: str) -> list:
        """Translate multiple texts"""
        return [
            self.translate(text, source_lang, target_lang)
            for text in texts
        ]
    
    def detect_language(self, text: str) -> Dict:
        """Detect language using Translate"""
        try:
            # Translate to English and check source language
            response = self.client.translate_text(
                Text=text[:500],
                SourceLanguageCode="auto",
                TargetLanguageCode="en"
            )
            detected = response["SourceLanguageCode"]
            return {
                "language_code": detected,
                "language_name": LANGUAGE_NAMES.get(detected, detected)
            }
        except ClientError as e:
            logger.error(f"Language detection error: {e}")
            return {"language_code": "en", "language_name": "English"}
    
    def get_supported_languages(self) -> list:
        """Return list of all supported languages"""
        return [
            {"code": code, "name": name, "translate_supported": TRANSLATE_LANGUAGES.get(code) is not None}
            for code, name in LANGUAGE_NAMES.items()
        ]


# Singleton
translate_service = TranslateService()
