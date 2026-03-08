"""Sarvam AI Service — Indian language STT (saarika:v2) + TTS (bulbul:v2)

STT  → POST https://api.sarvam.ai/speech-to-text
TTS  → POST https://api.sarvam.ai/text-to-speech
Auth → api-subscription-key header

Language detection is automatic via saarika:v2.
TTS speaker is auto-selected per detected/requested language.
"""

import base64
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SARVAM_BASE = "https://api.sarvam.ai"

# Short-code / BCP-47 → canonical BCP-47 used by Sarvam
LANG_MAP: dict[str, str] = {
    "hi": "hi-IN", "bn": "bn-IN", "gu": "gu-IN", "kn": "kn-IN",
    "ml": "ml-IN", "mr": "mr-IN", "od": "od-IN", "pa": "pa-IN",
    "ta": "ta-IN", "te": "te-IN", "en": "en-IN",
    # Already BCP-47 — pass through
    "hi-IN": "hi-IN", "bn-IN": "bn-IN", "gu-IN": "gu-IN", "kn-IN": "kn-IN",
    "ml-IN": "ml-IN", "mr-IN": "mr-IN", "od-IN": "od-IN", "pa-IN": "pa-IN",
    "ta-IN": "ta-IN", "te-IN": "te-IN", "en-IN": "en-IN",
}

# Default Sarvam speaker per language
SPEAKER_MAP: dict[str, str] = {
    "hi-IN": "meera",
    "bn-IN": "amartya",
    "gu-IN": "meera",
    "kn-IN": "pavithra",
    "ml-IN": "meera",
    "mr-IN": "aarohi",
    "od-IN": "meera",
    "pa-IN": "meera",
    "ta-IN": "pavithra",
    "te-IN": "arvind",
    "en-IN": "meera",
}


def _to_bcp47(lang: str) -> str:
    """Normalise any language code to BCP-47 (e.g. 'hi' → 'hi-IN')."""
    return LANG_MAP.get(lang, "en-IN")


class SarvamService:
    """Sarvam AI: STT (saarika:v2) + TTS (bulbul:v2) for Indian languages."""

    # ------------------------------------------------------------------
    # STT
    # ------------------------------------------------------------------

    async def speech_to_text(
        self,
        audio_bytes: bytes,
        hint_language: Optional[str] = None,
    ) -> dict:
        """Transcribe audio bytes (webm/wav/mp3) → text + detected language.

        Returns:
            {
                "text": "transcribed text",
                "language_code": "hi-IN",       # BCP-47 from Sarvam
                "detected_language": "hi-IN",
            }
        """
        if not settings.SARVAM_API_KEY:
            logger.warning("[Sarvam STT] SARVAM_API_KEY not set — returning empty")
            return {"text": "", "language_code": "en-IN", "detected_language": "en-IN"}

        if not audio_bytes:
            return {"text": "", "language_code": "en-IN", "detected_language": "en-IN"}

        try:
            form_data: dict = {"model": "saarika:v2"}
            if hint_language:
                form_data["language_code"] = _to_bcp47(hint_language)

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{SARVAM_BASE}/speech-to-text",
                    headers={"api-subscription-key": settings.SARVAM_API_KEY},
                    files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                    data=form_data,
                )
                resp.raise_for_status()
                result = resp.json()

            lang = result.get("language_code", "en-IN")
            text = result.get("transcript", "").strip()
            logger.info(f"[Sarvam STT] lang={lang} text={text[:60]!r}")
            return {"text": text, "language_code": lang, "detected_language": lang}

        except httpx.HTTPStatusError as e:
            logger.error(f"[Sarvam STT] HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            logger.error(f"[Sarvam STT] {type(e).__name__}: {e}")

        return {"text": "", "language_code": "en-IN", "detected_language": "en-IN"}

    # ------------------------------------------------------------------
    # TTS
    # ------------------------------------------------------------------

    async def text_to_speech(self, text: str, language: str = "en-IN") -> bytes:
        """Synthesise text to WAV audio using Sarvam bulbul:v2.

        Returns raw WAV bytes (22050 Hz, 16-bit mono).
        Returns empty bytes on failure or if service is not configured.
        """
        if not settings.SARVAM_API_KEY:
            logger.warning("[Sarvam TTS] SARVAM_API_KEY not set — returning empty")
            return b""

        text = text.strip()
        if not text:
            return b""

        lang = _to_bcp47(language)
        speaker = SPEAKER_MAP.get(lang, "meera")

        # Sarvam TTS has a ~500 char input limit per request; chunk if needed
        MAX_CHUNK = 500
        chunks = [text[i : i + MAX_CHUNK] for i in range(0, len(text), MAX_CHUNK)]

        all_audio = b""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                for chunk in chunks:
                    resp = await client.post(
                        f"{SARVAM_BASE}/text-to-speech",
                        headers={
                            "api-subscription-key": settings.SARVAM_API_KEY,
                            "Content-Type": "application/json",
                        },
                        json={
                            "inputs": [chunk],
                            "target_language_code": lang,
                            "speaker": speaker,
                            "model": "bulbul:v2",
                            "enable_preprocessing": True,
                        },
                    )
                    resp.raise_for_status()
                    audios = resp.json().get("audios", [])
                    if audios:
                        all_audio += base64.b64decode(audios[0])

            logger.info(f"[Sarvam TTS] lang={lang} speaker={speaker} audio_bytes={len(all_audio)}")

        except httpx.HTTPStatusError as e:
            logger.error(f"[Sarvam TTS] HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            logger.error(f"[Sarvam TTS] {type(e).__name__}: {e}")

        return all_audio


sarvam_service = SarvamService()
