import { useCallback, useRef, useEffect } from 'react';
import { useVoiceStore } from '@/stores/voiceStore';
import { useUserStore } from '@/stores/userStore';
import { generateId } from '@/lib/utils';
import type { VoiceMessage, VoiceState } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface UseVoiceReturn {
  state: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  isSupported: boolean;
  currentTranscript: string;
}

export function useVoice(): UseVoiceReturn {
  const { state, setState, addMessage, setCurrentTranscript, currentTranscript } = useVoiceStore();
  const { language, isDemoMode } = useUserStore();
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const langMap: Record<string, string> = {
    en: 'en-IN',
    hi: 'hi-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    bn: 'bn-IN',
    mr: 'mr-IN',
    gu: 'gu-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    pa: 'pa-IN',
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = langMap[language] || 'hi-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState('listening');
      setCurrentTranscript('');
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result[0].transcript)
        .join('');
      setCurrentTranscript(transcript);

      if (event.results[0].isFinal) {
        const message: VoiceMessage = {
          id: generateId(),
          role: 'user',
          text: transcript,
          timestamp: new Date(),
          language,
        };
        addMessage(message);
        setState('processing');

        // Demo mode: simulate AI response
        if (isDemoMode) {
          setTimeout(() => {
            const responses: Record<string, string> = {
              hi: 'मैंने आपकी बात सुनी। मैं आपके लिए उपयुक्त योजनाएं खोज रहा हूँ...',
              en: "I heard you. Let me find suitable schemes for you...",
            };
            const aiMessage: VoiceMessage = {
              id: generateId(),
              role: 'assistant',
              text: responses[language] || responses['en'],
              timestamp: new Date(),
              language,
            };
            addMessage(aiMessage);
            setState('speaking');
            speak(aiMessage.text);
          }, 1500);
        }
      }
    };

    recognition.onerror = () => {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    };

    recognition.onend = () => {
      if (state === 'listening') {
        setState('idle');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, language, isDemoMode, state, setState, setCurrentTranscript, addMessage]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langMap[language] || 'hi-IN';
      utterance.rate = 0.9;
      utterance.pitch = 1;

      utterance.onstart = () => setState('speaking');
      utterance.onend = () => setState('idle');
      utterance.onerror = () => setState('idle');

      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language, setState]
  );

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    setState('idle');
  }, [setState]);

  return {
    state,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    isSupported,
    currentTranscript,
  };
}
