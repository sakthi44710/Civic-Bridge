import { create } from 'zustand';
import type { VoiceState, VoiceMessage } from '@/types';

export interface ChatMessage {
  id: number;
  role: string;
  text: string;
}

interface VoiceStore {
  state: VoiceState;
  messages: VoiceMessage[];
  chatMessages: ChatMessage[];
  conversationId: string | null;
  isVoiceOnly: boolean;
  currentTranscript: string;
  setState: (state: VoiceState) => void;
  addMessage: (message: VoiceMessage) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  clearChatMessages: () => void;
  setConversationId: (id: string | null) => void;
  setVoiceOnly: (val: boolean) => void;
  setCurrentTranscript: (text: string) => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  state: 'idle',
  messages: [],
  chatMessages: [],
  conversationId: null,
  isVoiceOnly: false,
  currentTranscript: '',
  setState: (state) => set({ state }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  clearMessages: () => set({ messages: [] }),
  clearChatMessages: () => set({ chatMessages: [] }),
  setConversationId: (conversationId) => set({ conversationId }),
  setVoiceOnly: (isVoiceOnly) => set({ isVoiceOnly }),
  setCurrentTranscript: (currentTranscript) => set({ currentTranscript }),
}));
