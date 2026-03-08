"""Sarvam AI Service — Indian language STT (saarika:v2) + TTS (bulbul:v3)

STT  → POST https://api.sarvam.ai/speech-to-text
TTS  → POST https://api.sarvam.ai/text-to-speech
Auth → api-subscription-key header

Language detection is automatic via saarika:v2.
TTS: Ishita speaker (all languages), bulbul:v3, 8000 Hz.

Uses a shared httpx.AsyncClient per-instance for connection keep-alive (faster calls).
"""

import asyncio
import base64
import logging
import re
from typing import AsyncGenerator, Optional, Tuple

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

# Fixed TTS speaker — Ishita (all languages)
SPEAKER_MAP: dict[str, str] = {
    "hi-IN": "ishita",
    "bn-IN": "ishita",
    "gu-IN": "ishita",
    "kn-IN": "ishita",
    "ml-IN": "ishita",
    "mr-IN": "ishita",
    "od-IN": "ishita",
    "pa-IN": "ishita",
    "ta-IN": "ishita",
    "te-IN": "ishita",
    "en-IN": "ishita",
}


def _to_bcp47(lang: str) -> str:
    """Normalise any language code to BCP-47 (e.g. 'hi' → 'hi-IN')."""
    return LANG_MAP.get(lang, "en-IN")


class SarvamService:
    """Sarvam AI: STT (saarika:v2) + TTS (bulbul:v3, Ishita, 8000 Hz)."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        """Return shared AsyncClient, creating if needed. Keeps connections alive."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=SARVAM_BASE,
                headers={"api-subscription-key": settings.SARVAM_API_KEY},
                timeout=httpx.Timeout(15.0, connect=5.0),
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

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

            client = self._get_client()
            resp = await client.post(
                "/speech-to-text",
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
    # TTS — single call
    # ------------------------------------------------------------------

    async def text_to_speech(self, text: str, language: str = "en-IN") -> bytes:
        """Synthesise text → WAV audio (bulbul:v3, Ishita, 8000 Hz).

        Returns raw WAV bytes or empty bytes on failure.
        """
        if not settings.SARVAM_API_KEY:
            logger.warning("[Sarvam TTS] SARVAM_API_KEY not set — returning empty")
            return b""

        text = text.strip()
        if not text:
            return b""

        lang = _to_bcp47(language)
        speaker = SPEAKER_MAP.get(lang, "ishita")
        MAX_CHUNK = 500
        chunks = [text[i : i + MAX_CHUNK] for i in range(0, len(text), MAX_CHUNK)]

        all_audio = b""
        try:
            client = self._get_client()
            for chunk in chunks:
                resp = await client.post(
                    "/text-to-speech",
                    json={
                        "inputs": [chunk],
                        "target_language_code": lang,
                        "speaker": speaker,
                        "model": "bulbul:v3",
                        "speech_sample_rate": 8000,
                        "enable_preprocessing": True,
                    },
                )
                resp.raise_for_status()
                audios = resp.json().get("audios", [])
                if audios:
                    all_audio += base64.b64decode(audios[0])

            logger.info(f"[Sarvam TTS] lang={lang} speaker={speaker} bytes={len(all_audio)}")

        except httpx.HTTPStatusError as e:
            logger.error(f"[Sarvam TTS] HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:
            logger.error(f"[Sarvam TTS] {type(e).__name__}: {e}")

        return all_audio

    # ------------------------------------------------------------------
    # TTS — sentence streaming (yields one WAV chunk per sentence)
    # ------------------------------------------------------------------

    async def text_to_speech_sentences(
        self, text: str, language: str = "en-IN"
    ) -> AsyncGenerator[Tuple[str, bytes], None]:
        """Split text into sentences and yield (sentence, wav_bytes) per sentence.

        Enables streaming audio: first sentence plays while rest are synthesized.
        """
        sentences = re.split(r"(?<=[.!?\u0964])\s+", text.strip())
        sentences = [s.strip() for s in sentences if s.strip()]
        if not sentences:
            return

        for sentence in sentences:
            wav = await self.text_to_speech(sentence, language)
            if wav:
                yield sentence, wav

    async def close(self) -> None:
        """Close the shared HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()


sarvam_service = SarvamService()
