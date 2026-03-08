// useElevenLabsCall.js
//
// Manages two connections simultaneously:
//   1. ElevenLabs WebRTC -- voice in/out via @elevenlabs/react
//   2. Backend WebSocket -- tool dispatch and form events
//
// ElevenLabs is the MAIN AGENT (Claude Haiku 4.5).
// It calls 11 backend tools. Backend executes and returns string results.
// ElevenLabs speaks the results back to the user.
//
// noVNC visual stream is a separate iframe -- this hook does NOT handle screenshots.
// This hook only manages: tool dispatch, form events, OTP/CAPTCHA relay, transcript.

import { useRef, useState, useCallback, useEffect } from "react";
import { useConversation } from "@elevenlabs/react";

const AGENT_ID    = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
const WS_BASE     = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
const WS_ENDPOINT = `${WS_BASE}/api/v1/ws/voice`;

export function useElevenLabsCall({ token, onFormUpdate, onFormStarted, onFormStopped, onTranscript }) {
  const [inCall, setInCall]   = useState(false);
  const [status, setStatus]   = useState("idle");
  const wsRef                 = useRef(null);
  const pendingToolCalls      = useRef({});
  const isCallActiveRef       = useRef(false);

  // Connect to backend WebSocket
  const connectBackendWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_ENDPOINT}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "session_start", language: "en" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "tool_result": {
          const pending = pendingToolCalls.current[msg.call_id];
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(msg.result);
            delete pendingToolCalls.current[msg.call_id];
          }
          break;
        }
        case "form_started":
          onFormStarted?.();
          break;
        case "form_stopped":
          onFormStopped?.();
          break;
        case "form_update":
          onFormUpdate?.(msg.data);
          break;
        default:
          break;
      }
    };

    ws.onerror = (err) => console.error("[WS] Error:", err);
    ws.onclose = () => {
      if (isCallActiveRef.current) setTimeout(connectBackendWS, 3000);
    };
  }, [token, onFormUpdate, onFormStarted, onFormStopped]);

  // Send a tool_call to backend, return a Promise that resolves with the result string
  const callBackendTool = useCallback((toolName, params) => {
    return new Promise((resolve, reject) => {
      const callId = `${toolName}_${Date.now()}`;
      const timer  = setTimeout(() => {
        delete pendingToolCalls.current[callId];
        reject(new Error(`Tool '${toolName}' timed out`));
      }, 15000);

      pendingToolCalls.current[callId] = { resolve, reject, timer };
      wsRef.current?.send(JSON.stringify({ type: "tool_call", call_id: callId, tool: toolName, params }));
    });
  }, []);

  // 11 client tools registered with ElevenLabs agent
  // Each is async (params) => string
  // ElevenLabs calls these when it decides an action is needed
  const clientTools = {
    search_schemes:     (p) => callBackendTool("search_schemes", p),
    match_schemes:      (p) => callBackendTool("match_schemes", p),
    check_eligibility:  (p) => callBackendTool("check_eligibility", p),
    start_form_filling: (p) => callBackendTool("start_form_filling", p),
    get_form_status:    (p) => callBackendTool("get_form_status", p),
    get_missing_fields: (p) => callBackendTool("get_missing_fields", p),
    provide_field_data: (p) => callBackendTool("provide_field_data", p),
    stop_form_filling:  (p) => callBackendTool("stop_form_filling", p),
    get_user_profile:   (p) => callBackendTool("get_user_profile", p),
    get_user_documents: (p) => callBackendTool("get_user_documents", p),
    check_documents:    (p) => callBackendTool("check_documents", p),
  };

  const conversation = useConversation({
    onConnect: () => { setStatus("listening"); connectBackendWS(); },
    onDisconnect: () => {
      setStatus("idle");
      setInCall(false);
      isCallActiveRef.current = false;
      wsRef.current?.send(JSON.stringify({ type: "session_end" }));
    },
    onMessage: ({ message, source }) => {
      onTranscript?.({ role: source, text: message });
      if (source === "user") {
        wsRef.current?.send(JSON.stringify({ type: "voice_transcript", data: message }));
      } else if (source === "ai") {
        wsRef.current?.send(JSON.stringify({ type: "assistant_message", data: message }));
      }
    },
    onError: (err) => console.error("[ElevenLabs]", err),
    clientTools,
  });

  const startCall = useCallback(async () => {
    setInCall(true);
    setStatus("connecting");
    isCallActiveRef.current = true;
    await conversation.startSession({ agentId: AGENT_ID });
  }, [conversation]);

  const endCall = useCallback(async () => {
    isCallActiveRef.current = false;
    await conversation.endSession();
    setInCall(false);
    setStatus("idle");
    wsRef.current?.close();
  }, [conversation]);

  const submitOtp = useCallback((otp) => {
    wsRef.current?.send(JSON.stringify({ type: "submit_otp", otp }));
  }, []);

  const submitCaptcha = useCallback((text) => {
    wsRef.current?.send(JSON.stringify({ type: "submit_captcha", text }));
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { inCall, status: conversation.status || status, startCall, endCall, submitOtp, submitCaptcha };
}
