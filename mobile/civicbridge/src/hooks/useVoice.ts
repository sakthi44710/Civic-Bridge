import { useCallback, useEffect, useRef } from 'react';
import { useVoiceStore } from '@/stores/voiceStore';
import { useUserStore } from '@/stores/userStore';
import type { Language, TranscriptEntry } from '@/types';
import { vibrate } from '@/lib/utils';
import { createVoiceWebSocket, getToken, chatApi } from '@/lib/api';

// ─── WebSocket-backed voice + text chat ──────────────────
export function useVoice() {
  const { voiceState, setVoiceState, setTranscript, addEntry, transcript, conversationId } = useVoiceStore();
  const { setConversationId } = useVoiceStore();
  const { language } = useUserStore();
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledEndRef = useRef(0);
  const playingCountRef = useRef(0);

  // Connect to WebSocket
  const connectWS = useCallback(() => {
    const token = getToken();
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = createVoiceWebSocket(token);
    wsRef.current = ws;

    ws.onopen = () => {
      const startMsg: Record<string, unknown> = { type: 'session_start', language: language || 'en-IN' };
      if (conversationId) startMsg.conversation_id = conversationId;
      ws.send(JSON.stringify(startMsg));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onerror = () => setVoiceState('error');
    ws.onclose = () => {
      wsRef.current = null;
    };
  }, [language, conversationId]);

  const handleServerMessage = useCallback((msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'session_started':
        if (msg.conversation_id) setConversationId(msg.conversation_id as string);
        break;
      case 'transcript': {
        const entry: TranscriptEntry = {
          id: `${msg.role}-${Date.now()}`,
          type: msg.role === 'user' ? 'user' : 'ai',
          text: msg.text as string,
          timestamp: new Date(),
          language: (msg.language as Language) || language as Language,
        };
        addEntry(entry);
        if (msg.role === 'assistant') setVoiceState('speaking');
        break;
      }
      case 'audio_response':
        setVoiceState('speaking');
        playAudio(msg.data as string);
        if (msg.transcript) {
          addEntry({
            id: `ai-${Date.now()}`,
            type: 'ai',
            text: msg.transcript as string,
            timestamp: new Date(),
            language: (msg.language as Language) || language as Language,
          });
        }
        break;
      case 'status':
        if (msg.status === 'processing') setVoiceState('processing');
        else if (msg.status === 'listening') setVoiceState('listening');
        break;
      case 'error':
        console.error('[WS Error]', msg.message);
        setVoiceState('error');
        break;
    }
  }, [language, addEntry, setVoiceState, setConversationId]);

  // Audio playback
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: 22050 });
      scheduledEndRef.current = 0;
    }
    return audioCtxRef.current;
  }, []);

  const playAudio = useCallback(async (b64: string) => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      const startTime = Math.max(ctx.currentTime, scheduledEndRef.current);
      source.start(startTime);
      scheduledEndRef.current = startTime + audioBuffer.duration;
      playingCountRef.current++;
      source.onended = () => {
        playingCountRef.current--;
        if (playingCountRef.current <= 0) {
          setVoiceState('idle');
        }
      };
    } catch (e) {
      console.warn('[Audio]', e);
    }
  }, [getAudioCtx, setVoiceState]);

  // Start recording from mic
  const startListening = useCallback(async () => {
    if (voiceState !== 'idle' && voiceState !== 'error') return;
    await vibrate(50);
    setVoiceState('listening');
    setTranscript('');

    // Ensure WS connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWS();
      // Wait for connection
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 3000);
      });
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const buf = await blob.arrayBuffer();
        if (wsRef.current?.readyState === WebSocket.OPEN && buf.byteLength > 2000) {
          wsRef.current.send(buf);
          setVoiceState('processing');
        } else {
          setVoiceState('idle');
        }
      };
      mediaRecRef.current = recorder;
      recorder.start();
    } catch (e) {
      console.error('[Mic]', e);
      setVoiceState('error');
    }
  }, [voiceState, connectWS, setVoiceState, setTranscript]);

  const stopListening = useCallback(() => {
    if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop();
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    playingCountRef.current = 0;
    scheduledEndRef.current = 0;
    setVoiceState('idle');
  }, [setVoiceState]);

  // Send text message via WebSocket or REST
  const sendText = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userEntry: TranscriptEntry = {
      id: `user-${Date.now()}`,
      type: 'user',
      text,
      timestamp: new Date(),
      language: language as Language,
    };
    addEntry(userEntry);
    setVoiceState('processing');

    // Try WebSocket first
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text_message', data: text }));
      return;
    }

    // Fallback to REST chat API
    try {
      const res = await chatApi.sendMessage(text, conversationId || undefined, language);
      if (res.conversation_id) setConversationId(res.conversation_id);
      addEntry({
        id: `ai-${Date.now()}`,
        type: 'ai',
        text: res.message,
        timestamp: new Date(),
        language: (res.language as Language) || language as Language,
      });
      setVoiceState('idle');
    } catch (e) {
      console.error('[Chat]', e);
      addEntry({
        id: `ai-${Date.now()}`,
        type: 'ai',
        text: 'Sorry, I could not process your request. Please try again.',
        timestamp: new Date(),
        language: 'en',
      });
      setVoiceState('idle');
    }
  }, [language, conversationId, addEntry, setVoiceState, setConversationId]);

  const handleOrbTap = useCallback(() => {
    if (voiceState === 'idle' || voiceState === 'error') startListening();
    else if (voiceState === 'listening') stopListening();
    else if (voiceState === 'speaking') stopSpeaking();
  }, [voiceState, startListening, stopListening, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    voiceState,
    transcript,
    isSupported: true,
    handleOrbTap,
    startListening,
    stopListening,
    stopSpeaking,
    sendText,
    connectWS,
    speak: () => {}, // kept for backward compat
  };
}
