// useVoiceCall.ts
//
// Seamless voice call — auto-listen with silence detection (VAD)
//
// Frontend  → MediaRecorder (WebM/Opus) → WebSocket binary frame
// Backend     Sarvam STT → Mistral Large 3 (tool_use) → Sarvam TTS
// Frontend  ← audio_response (base64 WAV) ← WebSocket
//
// Call flow: startCall → auto-record → silence detected → send → AI responds
//           → AI finishes speaking → auto-record again → …

import { useRef, useState, useCallback, useEffect } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const WS_ENDPOINT = `${WS_BASE}/api/v1/ws/voice`;

// VAD settings
const SILENCE_THRESHOLD = 0.015;   // RMS below this = silence
const SILENCE_DURATION_MS = 1800;  // 1.8s of silence → auto-stop
const MIN_RECORD_MS = 600;         // minimum recording length before VAD kicks in

export type VoiceCallStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'recording'
  | 'processing'
  | 'speaking';

export interface FormUpdateData {
  session_id?: string;
  application_id?: string;
  scheme_id?: string;
  status?: string;
  message?: string;
  waiting_for?: 'otp' | 'captcha' | null;
  current_page?: number;
  total_pages?: number;
  fields_filled?: number;
  total_fields?: number;
  filled_fields?: Record<string, string>;
  newly_filled?: string[];
  page_name?: string;
  timestamp?: string;
}

interface UseVoiceCallOptions {
  token: string | null;
  conversationId?: string | null;
  onFormUpdate?: (data: FormUpdateData) => void;
  onFormStarted?: () => void;
  onFormStopped?: () => void;
  onScreenshot?: (dataUrl: string) => void;
  onTranscript?: (msg: { role: string; text: string }) => void;
  onSessionStarted?: (data: { conversation_id: string }) => void;
}

export function useVoiceCall({
  token,
  conversationId,
  onFormUpdate,
  onFormStarted,
  onFormStopped,
  onScreenshot,
  onTranscript,
  onSessionStarted,
}: UseVoiceCallOptions) {
  const [inCall, setInCall] = useState(false);
  const [status, setStatus] = useState<VoiceCallStatus>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);  // true = mic/auto-listen active

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isActiveRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledEndRef = useRef(0);
  const playingCountRef = useRef(0);

  // VAD (voice activity detection) refs
  const vadCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef(0);
  const silenceStartRef = useRef(0);
  const recordStartRef = useRef(0);
  const autoRecordRef = useRef(false);  // when true, auto-start after AI speaks
  const autoStartFnRef = useRef<(() => void) | null>(null);
  const connectWSRef = useRef<(() => void) | null>(null);

  // Stable callback refs to avoid stale closures
  const onFormUpdateRef = useRef(onFormUpdate);
  const onFormStartedRef = useRef(onFormStarted);
  const onFormStoppedRef = useRef(onFormStopped);
  const onScreenshotRef = useRef(onScreenshot);
  const onTranscriptRef = useRef(onTranscript);
  const onSessionStartedRef = useRef(onSessionStarted);
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    onFormUpdateRef.current = onFormUpdate;
    onFormStartedRef.current = onFormStarted;
    onFormStoppedRef.current = onFormStopped;
    onScreenshotRef.current = onScreenshot;
    onTranscriptRef.current = onTranscript;
    onSessionStartedRef.current = onSessionStarted;
    conversationIdRef.current = conversationId;
  }, [onFormUpdate, onFormStarted, onFormStopped, onScreenshot, onTranscript, onSessionStarted, conversationId]);

  // ── Audio playback (AudioContext — gapless scheduling) ─
  const _stopAllAudio = useCallback(() => {
    // Close existing audio context to immediately silence everything
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    scheduledEndRef.current = 0;
    playingCountRef.current = 0;
  }, []);

  const _getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 22050 });
      scheduledEndRef.current = 0;
    }
    return audioCtxRef.current;
  }, []);

  const _enqueueAudio = useCallback(
    async (b64: string) => {
      try {
        const ctx = _getAudioCtx();
        if (ctx.state === 'suspended') await ctx.resume();

        // Decode base64 → ArrayBuffer → AudioBuffer
        const binaryStr = atob(b64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        // Schedule gaplessly right after previous chunk
        const startTime = Math.max(ctx.currentTime, scheduledEndRef.current);
        source.start(startTime);
        scheduledEndRef.current = startTime + audioBuffer.duration;

        playingCountRef.current++;
        source.onended = () => {
          playingCountRef.current--;
          if (playingCountRef.current <= 0) {
            setStatus('listening');
            // Auto-resume recording after AI finishes speaking
            if (autoRecordRef.current && isActiveRef.current) {
              setTimeout(() => {
                if (isActiveRef.current && autoRecordRef.current) {
                  autoStartFnRef.current?.();
                }
              }, 300);
            }
          }
        };
      } catch (e) {
        console.warn('[Audio playback]', e);
      }
    },
    [_getAudioCtx],
  );

  // ── Server message handler ────────────────────────────
  const _handleServerMessage = useCallback(
    (msg: Record<string, unknown>) => {
      switch (msg.type) {
        case 'status':
          setStatus(msg.status as VoiceCallStatus);
          break;
        case 'session_started':
          onSessionStartedRef.current?.({ conversation_id: msg.conversation_id as string });
          break;
        case 'transcript':
          onTranscriptRef.current?.({ role: msg.role as string, text: msg.text as string });
          break;
        case 'audio_response':
          _enqueueAudio(msg.data as string);
          break;
        case 'form_started':
          onFormStartedRef.current?.();
          break;
        case 'form_stopped':
          onFormStoppedRef.current?.();
          break;
        case 'form_update':
          onFormUpdateRef.current?.(msg.data as FormUpdateData);
          break;
        case 'form_screenshot':
          onScreenshotRef.current?.(msg.data as string);
          break;
        case 'error':
          console.error('[WS server error]', msg.message);
          break;
      }
    },
    [_enqueueAudio],
  );

  // ── WebSocket connection ──────────────────────────────
  const connectWS = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_ENDPOINT}?token=${encodeURIComponent(token)}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      const startMsg: Record<string, unknown> = { type: 'session_start', language: 'en-IN' };
      if (conversationIdRef.current) startMsg.conversation_id = conversationIdRef.current;
      ws.send(JSON.stringify(startMsg));
      setStatus('listening');
      // Auto-start recording in seamless mode
      if (autoRecordRef.current) {
        setTimeout(() => autoStartFnRef.current?.(), 400);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          _handleServerMessage(msg);
        } catch {
          // ignore invalid JSON
        }
      }
    };

    ws.onerror = (err) => console.error('[WS] Error:', err);
    ws.onclose = () => {
      if (isActiveRef.current) setTimeout(() => connectWSRef.current?.(), 3000);
    };
  }, [token, _handleServerMessage]);

  // ── VAD: silence detection loop ─────────────────────────
  const _stopVad = useCallback(() => {
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = 0;
    }
  }, []);

  const _startVad = useCallback((stream: MediaStream) => {
    _stopVad();
    try {
      if (!vadCtxRef.current || vadCtxRef.current.state === 'closed') {
        vadCtxRef.current = new AudioContext();
      }
      const ctx = vadCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      silenceStartRef.current = 0;

      const dataArray = new Float32Array(analyser.fftSize);

      const check = () => {
        if (!isActiveRef.current) return;
        analyser.getFloatTimeDomainData(dataArray);
        // compute RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);

        const now = Date.now();
        const elapsed = now - recordStartRef.current;

        if (rms < SILENCE_THRESHOLD && elapsed > MIN_RECORD_MS) {
          if (silenceStartRef.current === 0) silenceStartRef.current = now;
          if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
            // Silence detected — auto-stop recording
            if (mediaRecRef.current?.state === 'recording') {
              mediaRecRef.current.stop();
            }
            _stopVad();
            return;
          }
        } else {
          silenceStartRef.current = 0;
        }
        vadRafRef.current = requestAnimationFrame(check);
      };
      vadRafRef.current = requestAnimationFrame(check);
    } catch (e) {
      console.warn('[VAD init]', e);
    }
  }, [_stopVad]);

  // ── Recording (shared logic) ──────────────────────────
  const _doStartRecording = useCallback(async () => {
    if (mediaRecRef.current?.state === 'recording') return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        _stopVad();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunks, { type: mimeType });
        try {
          const arrayBuffer = await blob.arrayBuffer();
          if (wsRef.current?.readyState === WebSocket.OPEN && arrayBuffer.byteLength > 1000) {
            // Stop any playing AI audio — user is speaking over it
            _stopAllAudio();
            wsRef.current.send(arrayBuffer);
          }
        } catch (e) {
          console.warn('[Recording send]', e);
        }
        setIsRecording(false);
        setStatus('processing');
      };

      recorder.start();
      recordStartRef.current = Date.now();
      setIsRecording(true);
      setStatus('recording');

      // Start VAD for auto-stop on silence
      _startVad(stream);
    } catch (e) {
      console.error('[Mic]', e);
      setStatus('listening');
    }
  }, [_startVad, _stopVad, _stopAllAudio]);

  // Auto-start recording (called after AI finishes speaking)
  const _autoStartRecording = useCallback(() => {
    if (!isActiveRef.current || !autoRecordRef.current) return;
    if (mediaRecRef.current?.state === 'recording') return;
    _doStartRecording();
  }, [_doStartRecording]);

  // Keep ref in sync so connectWS/onended can call it without circular deps
  useEffect(() => {
    autoStartFnRef.current = _autoStartRecording;
  }, [_autoStartRecording]);

  // Keep connectWSRef in sync for reconnect in ws.onclose
  useEffect(() => {
    connectWSRef.current = connectWS;
  }, [connectWS]);

  // ── Push-to-talk recording (manual fallback) ──────────
  const startRecording = useCallback(async () => {
    if (mediaRecRef.current?.state === 'recording') return;
    await _doStartRecording();
  }, [_doStartRecording]);

  const stopRecording = useCallback(() => {
    _stopVad();
    if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop();
    }
  }, [_stopVad]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ── Text message ──────────────────────────────────────
  const sendTextMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Immediately stop any playing AI audio so the new response isn't queued behind it
      _stopAllAudio();
      wsRef.current.send(JSON.stringify({ type: 'text_message', data: text }));
      setStatus('processing');
    }
  }, [_stopAllAudio]);

  // ── Session start / end ───────────────────────────────
  const startCall = useCallback(() => {
    setInCall(true);
    setVoiceMode(true);
    setStatus('connecting');
    isActiveRef.current = true;
    autoRecordRef.current = true;  // seamless mode: auto-listen
    scheduledEndRef.current = 0;
    playingCountRef.current = 0;
    connectWS();
  }, [connectWS]);

  // Text-only session: opens WebSocket but does NOT enable mic/auto-record
  const startTextSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return; // already connected
    setInCall(true);
    setVoiceMode(false);
    setStatus('connecting');
    isActiveRef.current = true;
    autoRecordRef.current = false;  // NO mic, NO auto-listen
    scheduledEndRef.current = 0;
    playingCountRef.current = 0;
    connectWS();
  }, [connectWS]);

  // Upgrade an existing text session to voice mode
  const enableVoice = useCallback(() => {
    if (!inCall) { startCall(); return; }
    setVoiceMode(true);
    autoRecordRef.current = true;
    // Start recording immediately
    setTimeout(() => autoStartFnRef.current?.(), 200);
  }, [inCall, startCall]);

  // Downgrade from voice to text-only (stop mic, keep WS open)
  const disableVoice = useCallback(() => {
    autoRecordRef.current = false;
    setVoiceMode(false);
    _stopVad();
    stopRecording();
    setStatus('listening');
  }, [_stopVad, stopRecording]);

  const endCall = useCallback(() => {
    isActiveRef.current = false;
    autoRecordRef.current = false;
    setVoiceMode(false);
    _stopVad();
    stopRecording();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session_end' }));
    }
    wsRef.current?.close();
    wsRef.current = null;
    setInCall(false);
    setStatus('idle');
    setIsRecording(false);
    scheduledEndRef.current = 0;
    playingCountRef.current = 0;
    // Close audio contexts
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    vadCtxRef.current?.close().catch(() => {});
    vadCtxRef.current = null;
  }, [stopRecording, _stopVad]);

  // ── OTP / CAPTCHA relay ───────────────────────────────
  const submitOtp = useCallback((otp: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'submit_otp', otp }));
    }
  }, []);

  const submitCaptcha = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'submit_captcha', text }));
    }
  }, []);

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      vadCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    inCall,
    voiceMode,
    status,
    isRecording,
    startCall,
    startTextSession,
    enableVoice,
    disableVoice,
    endCall,
    toggleRecording,
    startRecording,
    stopRecording,
    sendTextMessage,
    submitOtp,
    submitCaptcha,
  };
}
