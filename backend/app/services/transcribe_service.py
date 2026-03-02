"""
AWS Transcribe Service - Speech-to-Text for 22 Indian Languages
"""
import logging
import base64
import time
import json
from typing import Dict, Optional
from botocore.exceptions import ClientError
from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)

# Language mapping for AWS Transcribe
TRANSCRIBE_LANGUAGES = {
    "en": "en-IN", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN",
    "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN", "kn": "kn-IN",
    "ml": "ml-IN", "or": "or-IN", "pa": "pa-IN", "as": "as-IN",
    "ur": "ur-IN", "ne": "ne-IN",
    # Languages without direct Transcribe support - use Hindi/English as fallback
    "mai": "hi-IN", "sat": "hi-IN", "ks": "hi-IN", "kok": "hi-IN",
    "sd": "hi-IN", "doi": "hi-IN", "mni": "hi-IN", "brx": "hi-IN",
    "sa": "hi-IN",
}


class TranscribeService:
    """AWS Transcribe for speech-to-text in Indian languages"""
    
    def __init__(self):
        self.client = aws.transcribe()
        self.s3 = aws.s3()
    
    def transcribe_audio(self, audio_bytes: bytes, language: str = "en",
                         audio_format: str = "wav") -> Dict:
        """Transcribe audio to text"""
        # Upload audio to S3 temporarily
        job_name = f"civicbridge-{int(time.time() * 1000)}"
        s3_key = f"audio/temp/{job_name}.{audio_format}"
        
        content_types = {
            "wav": "audio/wav",
            "mp3": "audio/mpeg",
            "ogg": "audio/ogg",
            "webm": "audio/webm",
            "flac": "audio/flac"
        }
        
        try:
            # Upload to S3
            self.s3.put_object(
                Bucket=settings.DOCUMENTS_BUCKET,
                Key=s3_key,
                Body=audio_bytes,
                ContentType=content_types.get(audio_format, "audio/wav")
            )
            
            language_code = TRANSCRIBE_LANGUAGES.get(language, "en-IN")
            media_format = audio_format if audio_format in ["mp3", "wav", "flac", "ogg"] else "wav"
            
            # Start transcription job
            self.client.start_transcription_job(
                TranscriptionJobName=job_name,
                Media={"MediaFileUri": f"s3://{settings.DOCUMENTS_BUCKET}/{s3_key}"},
                MediaFormat=media_format,
                LanguageCode=language_code,
                OutputBucketName=settings.DOCUMENTS_BUCKET,
                OutputKey=f"audio/transcripts/{job_name}.json"
            )
            
            # Poll for completion (max 60 seconds)
            for _ in range(60):
                status = self.client.get_transcription_job(
                    TranscriptionJobName=job_name
                )
                job_status = status["TranscriptionJob"]["TranscriptionJobStatus"]
                
                if job_status == "COMPLETED":
                    # Get transcript
                    transcript_key = f"audio/transcripts/{job_name}.json"
                    transcript_obj = self.s3.get_object(
                        Bucket=settings.DOCUMENTS_BUCKET,
                        Key=transcript_key
                    )
                    transcript_data = json.loads(transcript_obj["Body"].read())
                    
                    text = transcript_data["results"]["transcripts"][0]["transcript"]
                    
                    # Cleanup temp files
                    self._cleanup(s3_key, transcript_key, job_name)
                    
                    return {
                        "text": text,
                        "language": language,
                        "confidence": self._get_confidence(transcript_data)
                    }
                elif job_status == "FAILED":
                    reason = status["TranscriptionJob"].get("FailureReason", "Unknown")
                    logger.error(f"Transcription failed: {reason}")
                    self._cleanup(s3_key, None, job_name)
                    return {"text": "", "language": language, "error": reason}
                
                time.sleep(1)
            
            # Timeout
            self._cleanup(s3_key, None, job_name)
            return {"text": "", "language": language, "error": "Transcription timeout"}
            
        except ClientError as e:
            logger.error(f"Transcribe error: {e}")
            return {"text": "", "language": language, "error": str(e)}
    
    def get_supported_languages(self) -> Dict:
        """Return supported languages for transcription"""
        return {
            code: lang_code 
            for code, lang_code in TRANSCRIBE_LANGUAGES.items()
        }
    
    def _get_confidence(self, transcript_data: Dict) -> float:
        """Extract average confidence from transcript"""
        try:
            items = transcript_data["results"]["items"]
            confidences = [
                float(item["alternatives"][0]["confidence"])
                for item in items
                if item.get("alternatives") and item["alternatives"][0].get("confidence")
            ]
            return round(sum(confidences) / len(confidences), 3) if confidences else 0.0
        except (KeyError, IndexError, ValueError):
            return 0.0
    
    def _cleanup(self, audio_key: str, transcript_key: Optional[str], job_name: str):
        """Clean up temporary files"""
        try:
            self.s3.delete_object(Bucket=settings.DOCUMENTS_BUCKET, Key=audio_key)
            if transcript_key:
                self.s3.delete_object(Bucket=settings.DOCUMENTS_BUCKET, Key=transcript_key)
            self.client.delete_transcription_job(TranscriptionJobName=job_name)
        except Exception as e:
            logger.warning(f"Cleanup error (non-critical): {e}")


# Singleton
transcribe_service = TranscribeService()
