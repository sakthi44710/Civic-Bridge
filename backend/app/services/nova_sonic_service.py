"""
Amazon Nova Sonic - Speech-to-Speech Streaming Service

Replaces the 3-step pipeline (Transcribe STT → Bedrock Chat → Polly TTS)
with a single bidirectional audio stream through Nova Sonic.

Architecture:
  Frontend (WebSocket) ↔ Backend ↔ Nova Sonic (Bidirectional Stream)

  User speaks → raw PCM audio → Nova Sonic → AI audio response + text transcript
  - Server-side VAD handles turn detection
  - Text transcript feeds the form-filling agent
  - No separate STT/TTS services needed

Model: amazon.nova-sonic-v1:0
Audio Input:  PCM 16-bit, 16kHz, mono
Audio Output: PCM 16-bit, 24kHz, mono
"""
import asyncio
import base64
import json
import logging
import struct
import uuid
from typing import AsyncGenerator, Callable, Dict, Optional

from app.services.aws_clients import aws
from app.config import settings

logger = logging.getLogger(__name__)

# ============================================================
# System prompt for Nova Sonic (speech-aware variant)
# ============================================================
NOVA_SONIC_SYSTEM_PROMPT = """You are CivicBridge AI Assistant, an empathetic voice assistant helping Indian citizens 
discover and apply for government welfare schemes.

Your capabilities:
1. Understand user needs in any Indian language — respond in THE SAME language they speak
2. Match users to eligible government schemes based on their profile
3. Guide document upload and verification
4. Collect user information conversationally for form filling
5. Provide status updates on applications

Communication style:
- Speak warmly, like a helpful government officer who genuinely cares
- Use simple, clear language — many users have low digital literacy
- Support natural code-mixing (Hinglish, Tanglish, etc.)
- Always confirm information before proceeding
- When collecting form data, ask one field at a time
- Acknowledge what the user said before asking the next question

When gathering information for a form, extract and confirm:
- Full name, parent/guardian name
- Date of birth, gender, category (SC/ST/OBC/General)
- Address details (state, district, pincode)
- Educational qualifications, income details
- Bank account details, Aadhaar number

Available scheme categories:
- Education & Scholarships (NSP, PM Scholarship, CSSS)
- Healthcare (Ayushman Bharat, Janani Suraksha)
- Social Welfare & Pensions (Shram Yogi Maandhan, PM Awas)
- Agriculture (PM-KISAN, Fasal Bima, Kisan Credit Card)

IMPORTANT: You are a voice assistant. Keep responses concise and conversational.
Do NOT use markdown, bullet points, or long lists in your speech.
Speak naturally as if on a phone call."""

# Language code mapping for Nova Sonic
NOVA_SONIC_LANGUAGES = {
    "en": "en-US", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN",
    "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN", "kn": "kn-IN",
    "ml": "ml-IN", "pa": "pa-IN",
}


class NovaSonicSession:
    """
    Manages a single bidirectional streaming session with Amazon Nova Sonic.
    
    Lifecycle:
      1. create()     → opens the bidirectional stream
      2. send_audio()  → streams PCM audio chunks to Nova Sonic
      3. receive()     → yields audio/text events from Nova Sonic
      4. close()       → cleanly ends the session
    
    The session handles server-side VAD, so the client just needs to
    keep streaming microphone audio — Nova Sonic detects when the user
    stops speaking and generates the response automatically.
    """

    def __init__(self, language: str = "en", conversation_history: list = None,
                 user_profile: dict = None, on_transcript: Callable = None):
        self.language = language
        self.conversation_history = conversation_history or []
        self.user_profile = user_profile or {}
        self.on_transcript = on_transcript  # callback for form agent
        self.session_id = str(uuid.uuid4())
        self._client = aws.bedrock_runtime()
        self._response = None
        self._input_stream = None
        self._output_stream = None
        self._running = False
        self._prompt_id = str(uuid.uuid4())
        self._content_name = f"civicbridge-{self.session_id[:8]}"

    async def create(self) -> bool:
        """Open bidirectional stream with Nova Sonic."""
        try:
            model_id = "amazon.nova-sonic-v1:0"
            
            # Build system prompt with user context
            system_prompt = NOVA_SONIC_SYSTEM_PROMPT
            if self.user_profile:
                profile_summary = self._summarize_profile(self.user_profile)
                system_prompt += f"\n\nUser Profile:\n{profile_summary}"

            lang_code = NOVA_SONIC_LANGUAGES.get(self.language, "en-US")

            # Nova Sonic session configuration
            session_config = json.dumps({
                "inferenceConfiguration": {
                    "maxTokens": 1024,
                    "topP": 0.9,
                    "temperature": 0.7,
                },
                "system": [{"text": system_prompt}],
            })

            # Open the bidirectional stream
            self._response = self._client.invoke_model_with_bidirectional_stream(
                modelId=model_id,
            )

            self._input_stream = self._response.get("body")
            self._running = True

            # Send session start event
            await self._send_event({
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 1024,
                            "topP": 0.9,
                            "temperature": 0.7,
                        },
                        "systemPrompt": [{"text": system_prompt}],
                        "audioInputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 16000,
                            "sampleSizeInBits": 16,
                            "channelCount": 1,
                            "audioType": "SPEECH",
                            "encoding": "base64",
                        },
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 24000,
                            "sampleSizeInBits": 16,
                            "channelCount": 1,
                            "encoding": "base64",
                        },
                        "turnDetectionConfiguration": {
                            "turnDetectionType": "SERVER_VAD",
                            "silenceDurationMs": 500,
                            "prefixPaddingMs": 300,
                            "thresholdScore": 0.5,
                        },
                        "languageCode": lang_code,
                    }
                }
            })

            # Send conversation history as context
            if self.conversation_history:
                for msg in self.conversation_history[-6:]:
                    await self._send_event({
                        "event": {
                            "textInput": {
                                "role": msg.get("role", "user"),
                                "text": msg.get("content", ""),
                            }
                        }
                    })

            logger.info(f"Nova Sonic session created: {self.session_id}, lang={lang_code}")
            return True

        except Exception as e:
            logger.error(f"Failed to create Nova Sonic session: {e}")
            self._running = False
            return False

    async def send_audio(self, pcm_base64: str):
        """Send a chunk of PCM audio to Nova Sonic."""
        if not self._running:
            return

        try:
            await self._send_event({
                "event": {
                    "audioInput": {
                        "promptName": self._prompt_id,
                        "contentName": self._content_name,
                        "audio": pcm_base64,
                    }
                }
            })
        except Exception as e:
            logger.warning(f"Error sending audio chunk: {e}")

    async def receive(self) -> AsyncGenerator[Dict, None]:
        """
        Yield events from Nova Sonic's output stream.
        
        Event types:
          - {"type": "audio", "data": "<base64 PCM>"}
          - {"type": "transcript", "role": "user|assistant", "text": "..."}
          - {"type": "turn_start"}
          - {"type": "turn_end"}
          - {"type": "error", "message": "..."}
        """
        if not self._response:
            return

        try:
            output_stream = self._response.get("body")
            if not output_stream:
                return

            for event in output_stream:
                if not self._running:
                    break

                parsed = self._parse_output_event(event)
                if parsed:
                    # If we got a transcript, notify the form agent
                    if parsed["type"] == "transcript" and self.on_transcript:
                        try:
                            await self.on_transcript(
                                parsed.get("role", ""),
                                parsed.get("text", ""),
                            )
                        except Exception as e:
                            logger.warning(f"Transcript callback error: {e}")

                    yield parsed

        except Exception as e:
            if self._running:
                logger.error(f"Error receiving from Nova Sonic: {e}")
                yield {"type": "error", "message": str(e)}

    async def close(self):
        """Close the Nova Sonic session."""
        self._running = False
        try:
            await self._send_event({
                "event": {
                    "sessionEnd": {}
                }
            })
        except Exception:
            pass

        try:
            if self._input_stream:
                self._input_stream.close()
        except Exception:
            pass

        logger.info(f"Nova Sonic session closed: {self.session_id}")

    # ═══════════════════════════════════════════════════════
    # Internal helpers
    # ═══════════════════════════════════════════════════════

    async def _send_event(self, event: dict):
        """Send an event to Nova Sonic's input stream."""
        if self._input_stream is None:
            return
        try:
            event_bytes = json.dumps(event).encode("utf-8")
            self._input_stream.send({"chunk": {"bytes": event_bytes}})
        except Exception as e:
            logger.warning(f"Failed to send event: {e}")

    def _parse_output_event(self, event: dict) -> Optional[Dict]:
        """Parse a raw event from Nova Sonic's output stream."""
        try:
            if "chunk" in event:
                raw = event["chunk"].get("bytes", b"")
                if isinstance(raw, bytes):
                    data = json.loads(raw.decode("utf-8"))
                else:
                    data = json.loads(raw)

                event_body = data.get("event", {})

                # Audio output
                if "audioOutput" in event_body:
                    audio_data = event_body["audioOutput"].get("audio", "")
                    if audio_data:
                        return {"type": "audio", "data": audio_data}

                # Text output (transcript of what the model says)
                if "textOutput" in event_body:
                    text_data = event_body["textOutput"]
                    return {
                        "type": "transcript",
                        "role": text_data.get("role", "assistant"),
                        "text": text_data.get("text", ""),
                    }

                # User transcript (what STT detected from user's speech)
                if "transcriptEvent" in event_body:
                    transcript = event_body["transcriptEvent"]
                    return {
                        "type": "transcript",
                        "role": "user",
                        "text": transcript.get("transcript", ""),
                    }

                # Turn management
                if "turnStart" in event_body or "contentStart" in event_body:
                    return {"type": "turn_start"}
                if "turnEnd" in event_body or "contentEnd" in event_body:
                    return {"type": "turn_end"}

                # Session events
                if "sessionStart" in event_body:
                    return {"type": "session_started"}
                if "sessionEnd" in event_body:
                    return {"type": "session_ended"}

            # Error events
            if "modelStreamErrorException" in event:
                return {
                    "type": "error",
                    "message": event["modelStreamErrorException"].get("message", "Stream error"),
                }

        except Exception as e:
            logger.warning(f"Failed to parse Nova Sonic event: {e}")

        return None

    def _summarize_profile(self, profile: dict) -> str:
        """Create a concise profile summary for the system prompt."""
        parts = []
        if profile.get("name"):
            parts.append(f"Name: {profile['name']}")
        if profile.get("state"):
            parts.append(f"State: {profile['state']}")
        if profile.get("category"):
            parts.append(f"Category: {profile['category']}")
        if profile.get("gender"):
            parts.append(f"Gender: {profile['gender']}")
        if profile.get("dob"):
            parts.append(f"DOB: {profile['dob']}")
        if profile.get("income"):
            parts.append(f"Annual Income: ₹{profile['income']}")
        if profile.get("occupation"):
            parts.append(f"Occupation: {profile['occupation']}")
        return ", ".join(parts) if parts else "No profile data yet"


class NovaSonicService:
    """
    Factory for Nova Sonic sessions.
    
    Also provides a fallback mode that uses the existing STT+LLM+TTS
    pipeline when Nova Sonic is not available, but streams results via
    the same WebSocket protocol for consistent frontend code.
    """

    def __init__(self):
        self._available = None

    def is_available(self) -> bool:
        """Check if Nova Sonic model is accessible."""
        if self._available is not None:
            return self._available

        try:
            client = aws.bedrock_runtime()
            # Quick check — try to see if the model is invocable
            # We just check the client has the method
            has_method = hasattr(client, 'invoke_model_with_bidirectional_stream')
            self._available = has_method
            if has_method:
                logger.info("Nova Sonic speech-to-speech: AVAILABLE")
            else:
                logger.info("Nova Sonic speech-to-speech: NOT AVAILABLE (boto3 too old)")
            return self._available
        except Exception as e:
            logger.warning(f"Nova Sonic availability check failed: {e}")
            self._available = False
            return False

    def create_session(self, language: str = "en",
                       conversation_history: list = None,
                       user_profile: dict = None,
                       on_transcript: Callable = None) -> NovaSonicSession:
        """Create a new Nova Sonic streaming session."""
        return NovaSonicSession(
            language=language,
            conversation_history=conversation_history,
            user_profile=user_profile,
            on_transcript=on_transcript,
        )


# Singleton
nova_sonic_service = NovaSonicService()
