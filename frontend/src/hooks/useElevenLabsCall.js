/**
 * useElevenLabsCall - ElevenLabs Conversational AI voice hook
 *
 * Uses ElevenLabs agent (WebRTC) for voice conversation:
 *   - Low-latency speech-to-speech via ElevenLabs cloud
 *   - Agent handles STT + AI reasoning + TTS natively
 *   - Client tools let the agent trigger backend actions (form fill, scheme search, etc.)
 *
 * Simultaneously connects to our backend WebSocket for:
 *   - Form filling (Playwright browser automation)
 *   - Scheme search, eligibility checks, profile/documents
 *   - Form screenshots / progress updates
 *   - OTP / CAPTCHA interaction
 *
 * Architecture:
 *   User speaks → ElevenLabs Agent (voice AI) → speaks back
 *                  ↓ client tools          ↓ transcripts
 *              Backend WS → Actions (form, schemes, docs) → results → Agent speaks
 *                         → Form Agent → Playwright → screenshots → Frontend
 */
import { useRef, useCallback, useEffect } from 'react';
import { useConversation } from '@elevenlabs/react';

const ELEVENLABS_AGENT_ID = 'agent_7601kk4db73hey2a3gc5e9jxemqd';

// Backend WebSocket URL for form filling bridge
const getBackendWsUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const token = localStorage.getItem('token') || '';
  return `${proto}//${host}/api/v1/ws/voice?token=${encodeURIComponent(token)}`;
};

export default function useElevenLabsCall({
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
  const backendWsRef = useRef(null);
  const inCallRef = useRef(false);
  const conversationIdRef = useRef(conversationId);
  const languageRef = useRef(language);
  const schemeIdRef = useRef(schemeId);
  const volIntervalRef = useRef(null);
  const currentAudioRef = useRef(null); // currently playing MP3 Audio element
  const pendingToolCallsRef = useRef({}); // { callId: { resolve, reject, timer } }

  // Keep refs in sync
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { schemeIdRef.current = schemeId; }, [schemeId]);

  // ─── Call backend tool via WebSocket (request-response pattern) ────
  const callBackendTool = useCallback((toolName, params = {}) => {
    return new Promise((resolve, reject) => {
      if (backendWsRef.current?.readyState !== WebSocket.OPEN) {
        resolve('Backend not connected. Please try again.');
        return;
      }
      const callId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Set a timeout so the agent doesn't hang forever
      const timer = setTimeout(() => {
        delete pendingToolCallsRef.current[callId];
        resolve('The action is still processing. I\'ll let you know when it completes.');
      }, 15000);
      pendingToolCallsRef.current[callId] = { resolve, reject, timer };
      backendWsRef.current.send(JSON.stringify({
        type: 'tool_call',
        call_id: callId,
        tool: toolName,
        params,
      }));
    });
  }, []);

  // ─── ElevenLabs conversation hook ─────────────────
  const elevenLabs = useConversation({
    onConnect: () => {
      console.log('[ElevenLabs] Connected');
      onStatusChange?.('listening');
    },
    onDisconnect: () => {
      console.log('[ElevenLabs] Disconnected');
      if (inCallRef.current) {
        inCallRef.current = false;
        onStatusChange?.('idle');
        onVolumeChange?.(0);
      }
    },
    onMessage: (message) => {
      // ElevenLabs sends message events with source and message text
      if (message.source === 'user') {
        onUserMessage?.(message.message);
        // Forward user transcript as voice_transcript (lightweight — no backend AI)
        forwardToBackend('voice_transcript', message.message);
      } else if (message.source === 'ai') {
        onAIMessage?.(message.message);
        // Forward AI response to backend so form agent gets context
        forwardToBackend('assistant_message', message.message);
      }
    },
    onError: (error) => {
      console.error('[ElevenLabs] Error:', error);
    },
    onModeChange: (mode) => {
      // mode.mode is 'speaking' or 'listening'
      if (mode.mode === 'speaking') {
        onStatusChange?.('speaking');
      } else if (mode.mode === 'listening') {
        onStatusChange?.('listening');
      }
    },
    // ─── Client Tools: actions the ElevenLabs agent can trigger ─────────
    clientTools: {
      // Search for government schemes
      search_schemes: async (params) => {
        console.log('[ClientTool] search_schemes', params);
        return await callBackendTool('search_schemes', {
          query: params.query || '',
          category: params.category || '',
        });
      },

      // Check eligibility for a specific scheme
      check_eligibility: async (params) => {
        console.log('[ClientTool] check_eligibility', params);
        return await callBackendTool('check_eligibility', {
          scheme_id: params.scheme_id || params.scheme_name || '',
        });
      },

      // Start filling a form for a scheme
      start_form_filling: async (params) => {
        console.log('[ClientTool] start_form_filling', params);
        return await callBackendTool('start_form_filling', {
          scheme_id: params.scheme_id || params.scheme_name || '',
        });
      },

      // Get current form filling progress
      get_form_status: async (_params) => {
        console.log('[ClientTool] get_form_status');
        return await callBackendTool('get_form_status', {});
      },

      // Get user's profile summary
      get_user_profile: async (_params) => {
        console.log('[ClientTool] get_user_profile');
        return await callBackendTool('get_user_profile', {});
      },

      // Get list of uploaded documents
      get_user_documents: async (_params) => {
        console.log('[ClientTool] get_user_documents');
        return await callBackendTool('get_user_documents', {});
      },

      // Check what documents are needed for a scheme
      check_documents: async (params) => {
        console.log('[ClientTool] check_documents', params);
        return await callBackendTool('check_documents', {
          scheme_id: params.scheme_id || params.scheme_name || '',
        });
      },
    },
  });

  // ─── Forward message to backend WebSocket (for form agent) ─────
  const forwardToBackend = useCallback((type, data) => {
    if (backendWsRef.current?.readyState === WebSocket.OPEN) {
      backendWsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  // ─── Handle backend WebSocket messages (form updates + text-only AI) ─────
  const handleBackendMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'session_started':
        if (msg.conversation_id) onConversationId?.(msg.conversation_id);
        break;

      case 'tool_result': {
        // Response to a client tool call — resolve the pending promise
        const callId = msg.call_id;
        const pending = pendingToolCallsRef.current[callId];
        if (pending) {
          clearTimeout(pending.timer);
          delete pendingToolCallsRef.current[callId];
          pending.resolve(msg.result || 'Done');
        }
        break;
      }

      case 'transcript':
        // When ElevenLabs voice call is active, it provides its own transcripts.
        // Backend transcripts are only used for text-only chat (no voice call).
        if (!inCallRef.current) {
          if (msg.role === 'user') {
            onUserMessage?.(msg.text);
          } else if (msg.role === 'assistant') {
            onAIMessage?.(msg.text);
          }
        }
        break;

      case 'audio_chunk':
        // Backend TTS audio — only play when NOT in an ElevenLabs voice call
        // (text-only chat needs audio feedback too)
        if (!inCallRef.current && msg.data) {
          playMP3Audio(msg.data);
        }
        break;

      case 'form_update':
        onFormUpdate?.(msg.data || msg);
        if (msg.data?.status === 'waiting_otp') {
          onOtpRequest?.(msg.data);
        } else if (msg.data?.status === 'waiting_captcha') {
          onCaptchaRequest?.(msg.data);
        }
        break;

      case 'form_started':
        console.log('[Backend] Form session started:', msg.session_id);
        break;

      case 'error':
        console.error('[Backend] Error:', msg.message);
        break;
    }
  }, []);

  // ─── Play MP3 audio (backend TTS for text-only chat) ────────
  const playMP3Audio = useCallback((base64) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
        currentAudioRef.current = null;
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; };
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; };
      currentAudioRef.current = audio;
      audio.play();
    } catch (e) {
      console.error('[Audio] MP3 playback error:', e);
    }
  }, []);

  // ─── Connect backend WebSocket ─────────────────────
  const connectBackendWs = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (backendWsRef.current?.readyState === WebSocket.OPEN) {
        resolve(backendWsRef.current);
        return;
      }

      const url = getBackendWsUrl();
      const ws = new WebSocket(url);

      ws.onopen = () => {
        backendWsRef.current = ws;
        // Send session_start so backend initializes user context
        ws.send(JSON.stringify({
          type: 'session_start',
          language: languageRef.current || 'en',
          conversation_id: conversationIdRef.current || undefined,
          scheme_id: schemeIdRef.current || undefined,
        }));
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleBackendMessage(msg);
        } catch (e) {
          console.error('[Backend WS] Parse error:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[Backend WS] Error:', err);
        reject(err);
      };

      ws.onclose = () => {
        backendWsRef.current = null;
      };
    });
  }, [handleBackendMessage]);

  // ─── Start the call (ElevenLabs voice + backend WS for forms) ─────
  const startCall = useCallback(async () => {
    try {
      // 1. Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Connect backend WebSocket for form filling
      await connectBackendWs();

      // 3. Start ElevenLabs voice conversation
      await elevenLabs.startSession({
        agentId: ELEVENLABS_AGENT_ID,
        connectionType: 'webrtc',
      });

      inCallRef.current = true;

      // 4. Poll for volume visualization
      volIntervalRef.current = setInterval(() => {
        if (!inCallRef.current) return;
        const vol = elevenLabs.getInputVolume?.() || 0;
        onVolumeChange?.(vol * 200);
      }, 100);

      onStatusChange?.('listening');
    } catch (err) {
      console.error('[ElevenLabs] Start call error:', err);
      onStatusChange?.('idle');
    }
  }, [connectBackendWs, elevenLabs]);

  // ─── End the call ──────────────────────────────────
  const endCall = useCallback(async () => {
    inCallRef.current = false;

    // Stop volume polling
    if (volIntervalRef.current) {
      clearInterval(volIntervalRef.current);
      volIntervalRef.current = null;
    }

    // End ElevenLabs session
    try {
      await elevenLabs.endSession();
    } catch { /* ignore */ }

    // Close backend WebSocket
    if (backendWsRef.current) {
      try {
        backendWsRef.current.send(JSON.stringify({ type: 'session_end' }));
      } catch { /* ignore */ }
      setTimeout(() => {
        if (backendWsRef.current) {
          backendWsRef.current.close();
          backendWsRef.current = null;
        }
      }, 500);
    }

    onStatusChange?.('idle');
    onVolumeChange?.(0);
  }, [elevenLabs]);

  // ─── Ensure backend WS is connected (for text-only chat) ───
  const ensureConnected = useCallback(async () => {
    return await connectBackendWs();
  }, [connectBackendWs]);

  // ─── Send text message ─────────────────────────────
  // Text goes to BOTH ElevenLabs (agent speaks response) AND backend WS (form agent)
  const sendTextMessage = useCallback(async (text) => {
    try {
      // Send to ElevenLabs agent — it will process and speak the response
      if (elevenLabs.status === 'connected') {
        elevenLabs.sendUserMessage(text);
      }
      // Also send to backend for form filling orchestration
      await ensureConnected();
      forwardToBackend('text_message', text);
    } catch (e) {
      console.error('[ElevenLabs] Failed to send text:', e);
      // Fallback: at least send to backend
      try {
        await ensureConnected();
        forwardToBackend('text_message', text);
      } catch { /* ignore */ }
    }
  }, [elevenLabs, ensureConnected, forwardToBackend]);

  // ─── Send raw message to backend WS ────────────────
  const sendRawMessage = useCallback((msgObj) => {
    if (backendWsRef.current?.readyState === WebSocket.OPEN) {
      backendWsRef.current.send(JSON.stringify(msgObj));
    } else {
      console.warn('[Backend WS] Not connected — cannot send:', msgObj?.type);
    }
  }, []);

  // ─── Form filling controls ────────────────────────
  const startFormSession = useCallback((schemeId) => {
    sendRawMessage({ type: 'start_form', scheme_id: schemeId });
  }, [sendRawMessage]);

  const submitOtp = useCallback((otp) => {
    sendRawMessage({ type: 'submit_otp', otp });
  }, [sendRawMessage]);

  const submitCaptcha = useCallback((text) => {
    sendRawMessage({ type: 'submit_captcha', text });
  }, [sendRawMessage]);

  // ─── Skip / stop agent speech ──────────────────────
  const skipResponse = useCallback(() => {
    // ElevenLabs doesn't have a direct "stop speaking" API
    // Sending user activity signals the agent the user wants to interrupt
    try {
      elevenLabs.sendUserActivity?.();
    } catch { /* ignore */ }
  }, [elevenLabs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inCallRef.current) {
        elevenLabs.endSession?.().catch(() => {});
      }
      if (volIntervalRef.current) clearInterval(volIntervalRef.current);
      // Clean up pending tool calls
      Object.values(pendingToolCallsRef.current).forEach(p => {
        clearTimeout(p.timer);
        p.resolve('Session ended');
      });
      pendingToolCallsRef.current = {};
      if (backendWsRef.current) {
        try { backendWsRef.current.send(JSON.stringify({ type: 'session_end' })); } catch { /* ignore */ }
        try { backendWsRef.current.close(); } catch { /* ignore */ }
        backendWsRef.current = null;
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
    isConnected: () => backendWsRef.current?.readyState === WebSocket.OPEN,
    // ElevenLabs specific
    isSpeaking: elevenLabs.isSpeaking,
    elevenLabsStatus: elevenLabs.status,
  };
}
