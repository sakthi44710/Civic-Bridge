import { create } from 'zustand';
import type { VoiceState, TranscriptEntry } from '@/types';

interface VoiceStoreState {
  voiceState: VoiceState;
  transcript: string;
  conversation: TranscriptEntry[];
  isRecording: boolean;
  isMuted: boolean;
  conversationId: string | null;
  setVoiceState: (state: VoiceState) => void;
  setTranscript: (text: string) => void;
  addEntry: (entry: TranscriptEntry) => void;
  clearConversation: () => void;
  setMuted: (v: boolean) => void;
  setConversationId: (id: string | null) => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  voiceState: 'idle',
  transcript: '',
  conversation: [],
  isRecording: false,
  isMuted: false,
  conversationId: null,

  setVoiceState: (voiceState) => set({ voiceState }),
  setTranscript:  (transcript)  => set({ transcript }),
  addEntry:  (entry) => set((s) => ({ conversation: [...s.conversation, entry] })),
  clearConversation: () => set({ conversation: [], transcript: '', conversationId: null }),
  setMuted: (isMuted) => set({ isMuted }),
  setConversationId: (conversationId) => set({ conversationId }),
}));
