/**
 * useNovaSonicCall - WebSocket-based speech-to-speech voice hook
 *
 * Replaces the REST-based useVoiceCall with a WebSocket connection that:
 *  1. Streams raw PCM audio directly to Nova Sonic (speech-to-speech)
 *  2. Receives AI audio + text transcripts in real-time
 *  3. Receives live form-filling updates (screenshots, field progress)
 *  4. Falls back to STT+LLM+TTS pipeline if Nova Sonic is unavailable
 *
 * The WebSocket protocol eliminates the per-turn HTTP roundtrip latency,
 * and Nova Sonic eliminates STT+TTS processing — resulting in a much
 * more natural conversation experience.
 *
 * Audio format:
 *   Input:  PCM 16-bit, 16kHz, mono → base64
 *   Output: PCM 16-bit, 24kHz, mono (Nova Sonic) or MP3 (fallback)
 */
import { useRef, useCallback, useEffect } from 'react';

// WebSocket URL (same host, /api/v1/ws/voice)
const getWsUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const token = localStorage.getItem('token') || '';
  return `${proto}//${host}/api/v1/ws/voice?token=${encodeURIComponent(token)}`;
};

// Audio processing constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE_NOVA = 24000;
const CHUNK_INTERVAL_MS = 100; // Send audio chunks every 100ms (PCM fallback only)

// BCP-47 codes for Web Speech API (primary STT in Chrome/Edge)
const SPEECH_API_LANGUAGES = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN',
  bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN',
  ml: 'ml-IN', pa: 'pa-IN', ur: 'ur-IN', or: 'or-IN',
  as: 'as-IN', ne: 'ne-IN',
  // Unsupported by Web Speech API — fall back to Hindi
  mai: 'hi-IN', sat: 'hi-IN', ks: 'hi-IN', kok: 'hi-IN',
  sd: 'hi-IN', doi: 'hi-IN', mni: 'hi-IN', brx: 'hi-IN', sa: 'hi-IN',
};

export default function useNovaSonicCall({
  conversationId,
  language,
  schemeId,
  onConversationId,
  onUserMessage,
  onAIMessage,
  onFormUpdate,
  onOtpRequest,
  onCaptchaRequest,
  onStatusChange,
  onVolumeChange,
}) {
  // Refs for mutable state
  const wsRef = useRef(null);
  const inCallRef = useRef(false);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const sourceRef = useRef(null);
  const chunkIntervalRef = useRef(null);
  const audioBufferRef = useRef([]);
  const playbackContextRef = useRef(null);
  const playbackQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isNovaSonicRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  const languageRef = useRef(language);
  const schemeIdRef = useRef(schemeId);
  const recognitionRef = useRef(null);  // Web Speech API recognition instance
  const volAnimRef = useRef(null);       // requestAnimationFrame handle for volume
  const currentAudioRef = useRef(null); // currently-playing MP3 Audio element
  const sttBufferRef = useRef('');       // accumulates partial STT results
  const sttTimerRef = useRef(null);      // debounce timer for STT flush

  // Keep refs in sync
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { schemeIdRef.current = schemeId; }, [schemeId]);

  // ─── Connect WebSocket ─────────────────────────────
  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const url = getWsUrl();
      const ws = new WebSocket(url);

      ws.onopen = () => {
        wsRef.current = ws;
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (inCallRef.current) {
          // Unexpected close — try to reconnect
          onStatusChange?.('idle');
          inCallRef.current = false;
        }
      };
    });
  }, []);

  // ─── Handle messages from server ───────────────────
  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'session_started':
        if (msg.conversation_id) onConversationId?.(msg.conversation_id);
        isNovaSonicRef.current = msg.nova_sonic || false;
        break;

      case 'audio_chunk':
        if (msg.format === 'pcm') {
          playPCMAudio(msg.data, OUTPUT_SAMPLE_RATE_NOVA);
        } else {
          // MP3 fallback
          playMP3Audio(msg.data);
        }
        break;

      case 'transcript':
        if (msg.role === 'user') {
          onUserMessage?.(msg.text);
        } else if (msg.role === 'assistant') {
          onAIMessage?.(msg.text);
        }
        break;

      case 'status':
        onStatusChange?.(msg.status);
        break;

      case 'form_update':
        // Dispatch to general handler
        onFormUpdate?.(msg.data || msg);
        // Also fire specific OTP/CAPTCHA handlers if status indicates waiting
        if (msg.data?.status === 'waiting_otp') {
          onOtpRequest?.(msg.data);
        } else if (msg.data?.status === 'waiting_captcha') {
          onCaptchaRequest?.(msg.data);
        }
        break;

      case 'form_started':
        console.log('Form session started:', msg.session_id);
        break;

      case 'error':
        console.error('Server error:', msg.message);
        break;
    }
  }, []);

  // ─── Start the call ────────────────────────────────
  const startCall = useCallback(async () => {
    try {
      // 1. Connect WebSocket
      const ws = await connectWebSocket();

      // 2. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 3. AudioContext for volume visualization ONLY (AnalyserNode, no ScriptProcessor)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const volBuf = new Float32Array(analyser.fftSize);
      const animVol = () => {
        if (!inCallRef.current) return;
        analyser.getFloatTimeDomainData(volBuf);
        let sum = 0;
        for (let i = 0; i < volBuf.length; i++) sum += Math.abs(volBuf[i]);
        onVolumeChange?.(sum / volBuf.length * 200);
        volAnimRef.current = requestAnimationFrame(animVol);
      };
      volAnimRef.current = requestAnimationFrame(animVol);

      inCallRef.current = true;

      // 4. Send session_start to server
      ws.send(JSON.stringify({
        type: 'session_start',
        language: languageRef.current || 'hi',
        conversation_id: conversationIdRef.current || undefined,
        scheme_id: schemeIdRef.current || undefined,
      }));

      // 5. Primary STT: Web Speech API (instant, no server roundtrip)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition && !isNovaSonicRef.current) {
        const recognition = new SpeechRecognition();
        recognition.lang = SPEECH_API_LANGUAGES[languageRef.current] || 'hi-IN';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
          if (!inCallRef.current) return;
          // Collect ALL new final results since last check
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const t = event.results[i][0].transcript.trim();
              if (t) sttBufferRef.current += (sttBufferRef.current ? ' ' : '') + t;
            }
          }
          // Debounce: wait 1.2s of silence then flush all accumulated text as ONE message
          if (sttTimerRef.current) clearTimeout(sttTimerRef.current);
          sttTimerRef.current = setTimeout(() => {
            const fullText = sttBufferRef.current.trim();
            sttBufferRef.current = '';
            if (fullText && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'text_message', data: fullText }));
            }
          }, 1200);
        };

        recognition.onerror = (e) => {
          // 'aborted' is normal on manual stop; 'no-speech' is normal silence
          if (e.error !== 'aborted' && e.error !== 'no-speech') {
            console.warn('SpeechRecognition error:', e.error);
          }
        };

        recognition.onend = () => {
          // Auto-restart if still in call (browser stops recognition on silence)
          if (inCallRef.current && recognitionRef.current) {
            try { recognition.start(); } catch { /* ignore race */ }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();

      } else {
        // Fallback: PCM streaming → backend AWS Transcribe (for Nova Sonic or unsupported browsers)
        _startPCMCapture(stream, audioContext, ws);
      }

      onStatusChange?.('listening');

    } catch (err) {
      console.error('Start call error:', err);
      onStatusChange?.('idle');
    }
  }, []);

  // ─── PCM capture fallback (for Nova Sonic path or non-Chrome browsers) ─────
  const _startPCMCapture = useCallback((stream, audioContext, ws) => {
    const source = audioContext.createMediaStreamSource(stream);
    const bufferSize = 2048;
    const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    scriptNodeRef.current = scriptNode;

    scriptNode.onaudioprocess = (e) => {
      if (!inCallRef.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      audioBufferRef.current.push(pcm16);
    };

    source.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    chunkIntervalRef.current = setInterval(() => {
      if (!inCallRef.current || !wsRef.current) return;
      const chunks = audioBufferRef.current;
      if (chunks.length === 0) return;
      audioBufferRef.current = [];
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      const bytes = new Uint8Array(merged.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'audio_chunk', data: base64 }));
      }
    }, CHUNK_INTERVAL_MS);
  }, []);

  // ─── End the call ──────────────────────────────────
  const endCall = useCallback(() => {
    inCallRef.current = false;

    // Stop volume animation
    if (volAnimRef.current) {
      cancelAnimationFrame(volAnimRef.current);
      volAnimRef.current = null;
    }

    // Flush any remaining STT buffer before stopping
    if (sttTimerRef.current) { clearTimeout(sttTimerRef.current); sttTimerRef.current = null; }
    if (sttBufferRef.current.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text_message', data: sttBufferRef.current.trim() }));
    }
    sttBufferRef.current = '';

    // Stop Web Speech API recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    // Stop PCM chunk sending (fallback path)
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Stop audio processing
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // Send session_end and close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'session_end' }));
      } catch { /* ignore */ }
      setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      }, 500);
    }

    // Stop playback
    stopPlayback();

    audioBufferRef.current = [];
    onStatusChange?.('idle');
    onVolumeChange?.(0);
  }, []);

  // ─── Ensure WebSocket is connected (for text-only chat) ───
  const ensureConnected = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }
    const ws = await connectWebSocket();
    // Send session_start for text-only session (no microphone needed)
    ws.send(JSON.stringify({
      type: 'session_start',
      language: languageRef.current || 'en',
      conversation_id: conversationIdRef.current || undefined,
      scheme_id: schemeIdRef.current || undefined,
    }));
    return ws;
  }, [connectWebSocket]);

  // ─── Send text message via WebSocket (auto-connects if needed) ───
  const sendTextMessage = useCallback(async (text) => {
    try {
      await ensureConnected();
      wsRef.current.send(JSON.stringify({
        type: 'text_message',
        data: text,
      }));
    } catch (e) {
      console.error('Failed to send text message via WebSocket:', e);
    }
  }, [ensureConnected]);

  // ─── Send any raw JSON message via WebSocket ───────
  const sendRawMessage = useCallback((msgObj) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected — cannot send:', msgObj?.type);
      return;
    }
    wsRef.current.send(JSON.stringify(msgObj));
  }, []);

  // ─── Start a form filling session for a scheme ──────
  const startFormSession = useCallback((schemeId) => {
    sendRawMessage({ type: 'start_form', scheme_id: schemeId });
  }, [sendRawMessage]);

  // ─── Submit OTP to the live browser ─────────────────
  const submitOtp = useCallback((otp) => {
    sendRawMessage({ type: 'submit_otp', otp });
  }, [sendRawMessage]);

  // ─── Submit CAPTCHA answer to the live browser ──────
  const submitCaptcha = useCallback((text) => {
    sendRawMessage({ type: 'submit_captcha', text });
  }, [sendRawMessage]);

  // ─── Skip current AI response ─────────────────────
  const skipResponse = useCallback(() => {
    stopPlayback();
  }, []);

  // ─── Play PCM audio (from Nova Sonic) ──────────────
  const playPCMAudio = useCallback((base64, sampleRate) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Convert Int16 to Float32
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Queue for playback
      playbackQueueRef.current.push({ samples: float32, sampleRate });
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (e) {
      console.error('PCM playback error:', e);
    }
  }, []);

  // ─── Play queued audio chunks ──────────────────────
  const playNextChunk = useCallback(async () => {
    if (playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const { samples, sampleRate } = playbackQueueRef.current.shift();

    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = playbackContextRef.current;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => playNextChunk();
    source.start();
  }, []);

  // ─── Play MP3 audio (fallback TTS) ─────────────────
  const playMP3Audio = useCallback((base64) => {
    try {
      // Stop whatever is currently speaking before starting the new audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
        currentAudioRef.current = null;
      }
      onStatusChange?.('speaking');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        onStatusChange?.('listening');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        onStatusChange?.('listening');
      };
      currentAudioRef.current = audio;
      audio.play();
    } catch (e) {
      console.error('MP3 playback error:', e);
    }
  }, []);

  // ─── Stop all playback ─────────────────────────────
  const stopPlayback = useCallback(() => {
    // Stop the current MP3 audio element
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(() => {});
      playbackContextRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inCallRef.current) {
        endCall();
      } else if (wsRef.current) {
        // Close text-only WS session
        try { wsRef.current.send(JSON.stringify({ type: 'session_end' })); } catch { /* ignore */ }
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, []);

  return {
    startCall,
    endCall,
    sendTextMessage,
    sendRawMessage,
    ensureConnected,
    startFormSession,
    submitOtp,
    submitCaptcha,
    skipResponse,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };
}
