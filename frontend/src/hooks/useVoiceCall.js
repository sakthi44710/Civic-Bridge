/**
 * useVoiceCall - Seamless phone-call style voice interaction hook
 *
 * After user taps "Tap to start", this hook manages:
 *  1. Continuous microphone listening with Voice Activity Detection (VAD)
 *  2. Auto-sends audio when silence is detected (user stopped speaking)
 *  3. Plays AI response audio
 *  4. Auto-resumes listening after AI finishes speaking
 *  5. Feels like a natural phone conversation
 *
 * Uses Web Audio API AnalyserNode for real-time volume monitoring.
 */
import { useRef, useCallback, useEffect } from 'react';
import { voiceAPI } from '../services/api';

// VAD configuration — tuned for instant response feel
const SILENCE_THRESHOLD = 12;     // Volume level below which is "silence"
const SILENCE_DURATION = 1200;    // ms of silence before auto-send (was 1800 — faster cutoff)
const MIN_SPEECH_TIME = 400;      // ms of speech required (was 600 — accept shorter phrases)
const VOLUME_CHECK_INTERVAL = 50; // ms between volume checks (was 80 — more responsive)

export default function useVoiceCall({
  conversationId,
  language,
  onConversationId,
  onUserMessage,
  onAIMessage,
  onFormUpdate,
  onResearchResults,
  onStatusChange,
  onVolumeChange,
}) {
  // Refs for mutable state (avoids stale closures)
  const inCallRef = useRef(false);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const speechStartRef = useRef(null);
  const silenceStartRef = useRef(null);
  const isProcessingRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  const languageRef = useRef(language);

  // Keep refs in sync with props
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // ─── Start the phone call ──────────────────────────
  const startCall = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Set up Web Audio API for volume analysis (VAD)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      inCallRef.current = true;
      onStatusChange?.('listening');

      // Begin first listening cycle
      beginListening();
    } catch (err) {
      console.error('Microphone access error:', err);
      onStatusChange?.('idle');
    }
  }, []);

  // ─── Begin a listening cycle ───────────────────────
  const beginListening = useCallback(() => {
    if (!inCallRef.current || !streamRef.current) return;

    const stream = streamRef.current;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (isProcessingRef.current) return; // Prevent double processing
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      if (blob.size < 800) {
        // Too small - resume listening
        if (inCallRef.current) {
          onStatusChange?.('listening');
          beginListening();
        }
        return;
      }
      processAudioChunk(blob, mimeType);
    };

    recorder.start(250); // Collect data every 250ms
    mediaRecorderRef.current = recorder;
    speechStartRef.current = null;
    silenceStartRef.current = null;
    onStatusChange?.('listening');

    // Start VAD monitoring
    startVADMonitor();
  }, []);

  // ─── Voice Activity Detection monitor ──────────────
  const startVADMonitor = useCallback(() => {
    // Clear any existing interval
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);

    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    vadIntervalRef.current = setInterval(() => {
      if (!inCallRef.current) {
        clearInterval(vadIntervalRef.current);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avgVolume = sum / bufferLength;

      // Report volume for visualization
      onVolumeChange?.(avgVolume);

      if (avgVolume >= SILENCE_THRESHOLD) {
        // User is speaking
        if (!speechStartRef.current) speechStartRef.current = Date.now();
        silenceStartRef.current = null;
      } else {
        // Silence detected
        if (!silenceStartRef.current) silenceStartRef.current = Date.now();

        const hasSpeech = speechStartRef.current &&
          (Date.now() - speechStartRef.current) >= MIN_SPEECH_TIME;
        const silenceDuration = Date.now() - silenceStartRef.current;

        if (hasSpeech && silenceDuration >= SILENCE_DURATION) {
          // User finished speaking → send audio
          clearInterval(vadIntervalRef.current);
          stopRecorderAndProcess();
        }
      }
    }, VOLUME_CHECK_INTERVAL);
  }, []);

  // ─── Stop recorder (triggers onstop → processAudioChunk) ──
  const stopRecorderAndProcess = useCallback(() => {
    isProcessingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ─── Process audio chunk → AI → TTS → resume ──────
  const processAudioChunk = useCallback(async (blob, mimeType) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    // No 'processing' status — keep connected state for instant feel

    try {
      const formData = new FormData();
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      formData.append('audio', blob, `recording.${ext}`);
      formData.append('language', languageRef.current || 'hi');
      if (conversationIdRef.current) {
        formData.append('conversation_id', conversationIdRef.current);
      }

      const resp = await voiceAPI.processVoice(formData);
      const data = resp.data;

      // Update conversation ID
      if (data.conversation_id) onConversationId?.(data.conversation_id);
      // Add messages to chat
      if (data.user_text) onUserMessage?.(data.user_text);
      if (data.response_text) onAIMessage?.(data.response_text, data.intent, data.agents_used);
      // Multi-agent results
      if (data.form_update) onFormUpdate?.(data.form_update);
      if (data.research_results) onResearchResults?.(data.research_results);

      // Play AI audio response, then resume listening
      if (data.audio_base64) {
        await playAudioResponse(data.audio_base64);
      }
    } catch (err) {
      console.error('Voice processing error:', err);
      // Show error toast to user
      if (typeof window !== 'undefined' && window.toast) {
        window.toast.error('Voice processing failed. Please try again.');
      }
    }

    isProcessingRef.current = false;

    // Resume listening if still in call
    if (inCallRef.current) {
      onStatusChange?.('listening');
      beginListening();
    } else {
      onStatusChange?.('idle');
    }
  }, []);

  // ─── Play audio response (instant start) ────────
  const playAudioResponse = useCallback((base64) => {
    return new Promise((resolve) => {
      onStatusChange?.('speaking');
      try {
        // Decode base64 → blob → object URL for instant playback (no buffering delay)
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = 'auto';
        audioPlayerRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          resolve();
        };
        audio.src = url;
        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          audioPlayerRef.current = null;
          resolve();
        });
      } catch {
        audioPlayerRef.current = null;
        resolve();
      }
    });
  }, []);

  // ─── End the call ──────────────────────────────────
  const endCall = useCallback(() => {
    inCallRef.current = false;

    // Stop VAD
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }

    // Stop recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      isProcessingRef.current = true; // Prevent onstop from processing
      mediaRecorderRef.current.stop();
    }

    // Stop audio playback
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    // Release microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    isProcessingRef.current = false;
    onStatusChange?.('idle');
  }, []);

  // ─── Skip current AI response ─────────────────────
  const skipResponse = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
      // Resume listening immediately
      if (inCallRef.current) {
        onStatusChange?.('listening');
        beginListening();
      }
    }
  }, []);

  // ─── Cleanup on unmount ───────────────────────────
  useEffect(() => {
    return () => {
      inCallRef.current = false;
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        isProcessingRef.current = true;
        mediaRecorderRef.current.stop();
      }
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return {
    inCall: inCallRef.current,
    startCall,
    endCall,
    skipResponse,
  };
}
