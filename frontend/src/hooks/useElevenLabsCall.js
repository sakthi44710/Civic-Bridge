// useElevenLabsCall.js  (file kept as-is for import compatibility)
//
// Voice pipeline — Sarvam AI + Claude Haiku 4.5 (replaces ElevenLabs)
//
// Architecture:
//   Frontend  → MediaRecorder (WebM/Opus) → WebSocket binary frame
//   Backend    Sarvam STT → Claude Haiku 4.5 (tool_use) → Sarvam TTS
//   Frontend  ← audio_response (base64 WAV) ← WebSocket
//
// Push-to-talk:  call startRecording() / stopRecording()
// Text input:    call sendTextMessage(text)
// Form:          OTP/CAPTCHA/form state managed here, exposed to VoiceChat

import { useRef, useState, useCallback, useEffect } from "react";

const WS_BASE     = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
const WS_ENDPOINT = `${WS_BASE}/api/v1/ws/voice`;

export function useElevenLabsCall({ token, onFormUpdate, onFormStarted, onFormStopped, onTranscript }) {
  const [inCall, setInCall]           = useState(false);
  const [status, setStatus]           = useState("idle");
  const [isRecording, setIsRecording] = useState(false);

  const wsRef          = useRef(null);
  const mediaRecRef    = useRef(null);
  const streamRef      = useRef(null);
  const audioCtxRef    = useRef(null);
  const isActiveRef    = useRef(false);

  // ------------------------------------------------------------------
  // WebSocket connection + message handler
  // ------------------------------------------------------------------
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_ENDPOINT}?token=${token}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "session_start", language: "en-IN" }));
      setStatus("listening");
    };

    ws.onmessage = (event) => {
      // Binary frames are not sent from server — all server messages are JSON
      if (!(event.data instanceof ArrayBuffer)) {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        _handleServerMessage(msg);
      }
    };

    ws.onerror = (err) => console.error("[WS] Error:", err);
    ws.onclose = () => {
      if (isActiveRef.current) setTimeout(connectWS, 3000);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const _handleServerMessage = useCallback((msg) => {
    switch (msg.type) {
      case "status":
        setStatus(msg.status);
        break;

      case "transcript":
        onTranscript?.({ role: msg.role, text: msg.text });
        break;

      case "audio_response":
        _playAudio(msg.data);
        break;

      case "form_started":
        onFormStarted?.();
        break;

      case "form_stopped":
        onFormStopped?.();
        break;

      case "form_update":
        onFormUpdate?.(msg.data);
        break;

      case "error":
        console.error("[WS server error]", msg.message);
        break;

      default:
        break;
    }
  }, [onFormUpdate, onFormStarted, onFormStopped, onTranscript]);

  // ------------------------------------------------------------------
  // Audio playback — play base64 WAV received from Sarvam TTS
  // ------------------------------------------------------------------
  const _playAudio = (base64wav) => {
    try {
      const audio = new Audio(`data:audio/wav;base64,${base64wav}`);
      audio.onended = () => setStatus("listening");
      audio.play().catch((e) => console.warn("[Audio play]", e));
    } catch (e) {
      console.warn("[Audio decode]", e);
    }
  };

  // ------------------------------------------------------------------
  // Push-to-talk recording
  // ------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    if (isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecRef.current = recorder;
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunks, { type: mimeType });
        // Send as binary WebSocket frame for efficiency
        try {
          const arrayBuffer = await blob.arrayBuffer();
          if (wsRef.current?.readyState === WebSocket.OPEN && arrayBuffer.byteLength > 1000) {
            wsRef.current.send(arrayBuffer);
          }
        } catch (e) {
          console.warn("[Recording send]", e);
        }
        setIsRecording(false);
        setStatus("processing");
      };

      recorder.start();
      setIsRecording(true);
      setStatus("recording");
    } catch (e) {
      console.error("[Mic]", e);
      setStatus("listening");
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecRef.current?.state === "recording") {
      mediaRecRef.current.stop();
    }
  }, []);

  // Toggle recording: click once to start, click again to stop
  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ------------------------------------------------------------------
  // Text message
  // ------------------------------------------------------------------
  const sendTextMessage = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text_message", data: text }));
      setStatus("processing");
    }
  }, []);

  // ------------------------------------------------------------------
  // Session start / end
  // ------------------------------------------------------------------
  const startCall = useCallback(async () => {
    setInCall(true);
    setStatus("connecting");
    isActiveRef.current = true;
    connectWS();
  }, [connectWS]);

  const endCall = useCallback(() => {
    isActiveRef.current = false;
    stopRecording();
    wsRef.current?.send(JSON.stringify({ type: "session_end" }));
    wsRef.current?.close();
    wsRef.current = null;
    setInCall(false);
    setStatus("idle");
    setIsRecording(false);
  }, [stopRecording]);

  // ------------------------------------------------------------------
  // OTP / CAPTCHA relay
  // ------------------------------------------------------------------
  const submitOtp = useCallback((otp) => {
    wsRef.current?.send(JSON.stringify({ type: "submit_otp", otp }));
  }, []);

  const submitCaptcha = useCallback((text) => {
    wsRef.current?.send(JSON.stringify({ type: "submit_captcha", text }));
  }, []);

  // ------------------------------------------------------------------
  useEffect(() => () => { wsRef.current?.close(); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  return {
    inCall, status, isRecording,
    startCall, endCall,
    toggleRecording, startRecording, stopRecording,
    sendTextMessage,
    submitOtp, submitCaptcha,
  };
}
