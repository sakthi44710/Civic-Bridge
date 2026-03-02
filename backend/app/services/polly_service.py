"""
AWS Polly Service - Text-to-Speech with Regional Indian Accents
"""
import logging
import base64
from typing import Dict, Optional
from botocore.exceptions import ClientError
from app.services.aws_clients import aws

logger = logging.getLogger(__name__)

# Polly (Kajal neural) natively supports: en-IN, hi-IN, te-IN, bn-IN, mr-IN, gu-IN, kn-IN, ml-IN
# All other Indian languages fall back to hi-IN (Kajal still produces intelligible Indian TTS)
_KAJAL = {"voice_id": "Kajal", "engine": "neural"}
POLLY_VOICES = {
    "en": _KAJAL, "hi": _KAJAL, "ta": _KAJAL, "te": _KAJAL,
    "bn": _KAJAL, "mr": _KAJAL, "gu": _KAJAL, "kn": _KAJAL, "ml": _KAJAL,
    "pa": _KAJAL, "or": _KAJAL, "as": _KAJAL, "ur": _KAJAL,
    "mai": _KAJAL, "kok": _KAJAL, "ne": _KAJAL, "sd": _KAJAL,
    "ks": _KAJAL, "doi": _KAJAL, "mni": _KAJAL, "sat": _KAJAL,
    "brx": _KAJAL, "sa": _KAJAL,
}

# SSML lang codes — unmapped languages fall back to hi-IN to avoid Polly errors
POLLY_LANGUAGE_CODES = {
    "en": "en-IN", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN",
    "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN", "kn": "kn-IN",
    "ml": "ml-IN", "pa": "hi-IN",  # pa-IN not in Kajal — use hi-IN
    # Remaining 8th Schedule: all fall back to hi-IN
    "or": "hi-IN", "as": "hi-IN", "ur": "hi-IN", "mai": "hi-IN",
    "kok": "hi-IN", "ne": "hi-IN", "sd": "hi-IN", "ks": "hi-IN",
    "doi": "hi-IN", "mni": "hi-IN", "sat": "hi-IN", "brx": "hi-IN",
    "sa": "hi-IN",
}


class PollyService:
    """AWS Polly for text-to-speech in Indian languages"""
    
    def __init__(self):
        self.client = aws.polly()
    
    def synthesize(self, text: str, language: str = "en",
                   output_format: str = "mp3") -> Dict:
        """Convert text to speech"""
        voice_config = POLLY_VOICES.get(language, POLLY_VOICES["en"])
        
        try:
            # Use SSML for better pronunciation
            lang_code = POLLY_LANGUAGE_CODES.get(language, "en-IN")
            ssml_text = f'<speak><lang xml:lang="{lang_code}">{self._escape_ssml(text)}</lang></speak>'
            
            response = self.client.synthesize_speech(
                Text=ssml_text,
                TextType="ssml",
                OutputFormat=output_format,
                VoiceId=voice_config["voice_id"],
                Engine=voice_config["engine"],
            )
            
            audio_stream = response["AudioStream"].read()
            audio_base64 = base64.b64encode(audio_stream).decode("utf-8")
            
            return {
                "audio_base64": audio_base64,
                "content_type": response["ContentType"],
                "language": language,
                "characters_used": len(text)
            }
        except ClientError as e:
            logger.error(f"Polly synthesis error: {e}")
            # Try with standard engine as fallback
            try:
                response = self.client.synthesize_speech(
                    Text=text[:3000],
                    TextType="text",
                    OutputFormat=output_format,
                    VoiceId="Aditi",
                    Engine="standard",
                )
                audio_stream = response["AudioStream"].read()
                audio_base64 = base64.b64encode(audio_stream).decode("utf-8")
                return {
                    "audio_base64": audio_base64,
                    "content_type": response["ContentType"],
                    "language": language,
                    "characters_used": len(text)
                }
            except ClientError as e2:
                logger.error(f"Polly fallback error: {e2}")
                return {"audio_base64": "", "error": str(e2)}
    
    def get_available_voices(self, language: str = None) -> list:
        """List available Polly voices for Indian languages"""
        try:
            params = {}
            if language:
                lang_code = POLLY_LANGUAGE_CODES.get(language, "en-IN")
                params["LanguageCode"] = lang_code
            
            response = self.client.describe_voices(**params)
            return [
                {
                    "voice_id": v["Id"],
                    "name": v["Name"],
                    "gender": v["Gender"],
                    "language": v["LanguageCode"],
                    "engine": v.get("SupportedEngines", ["standard"])
                }
                for v in response.get("Voices", [])
                if "IN" in v.get("LanguageCode", "")
            ]
        except ClientError as e:
            logger.error(f"Error listing voices: {e}")
            return []
    
    def _escape_ssml(self, text: str) -> str:
        """Escape special characters for SSML"""
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")
        text = text.replace('"', "&quot;")
        text = text.replace("'", "&apos;")
        return text


# Singleton
polly_service = PollyService()
