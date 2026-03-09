import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Language, FamilyMember } from '@/types';
import { DEFAULT_LANGUAGE } from '@/lib/constants';

interface UserState {
  user: User | null;
  token: string | null;
  language: Language;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isDemoMode: boolean;
  isCyberCafeMode: boolean;
  highContrastMode: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLanguage: (lang: Language) => void;
  setAuthenticated: (val: boolean) => void;
  setOnboarded: (val: boolean) => void;
  setDemoMode: (val: boolean) => void;
  setCyberCafeMode: (val: boolean) => void;
  setHighContrastMode: (val: boolean) => void;
  addFamilyMember: (member: FamilyMember) => void;
  removeFamilyMember: (id: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      language: DEFAULT_LANGUAGE,
      isAuthenticated: false,
      isOnboarded: false,
      isDemoMode: false,
      isCyberCafeMode: false,
      highContrastMode: false,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setLanguage: (language) => set({ language }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setOnboarded: (isOnboarded) => set({ isOnboarded }),
      setDemoMode: (isDemoMode) => set({ isDemoMode }),
      setCyberCafeMode: (isCyberCafeMode) => set({ isCyberCafeMode }),
      setHighContrastMode: (highContrastMode) => set({ highContrastMode }),
      addFamilyMember: (member) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, familyMembers: [...state.user.familyMembers, member] }
            : null,
        })),
      removeFamilyMember: (id) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, familyMembers: state.user.familyMembers.filter((m) => m.id !== id) }
            : null,
        })),
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isDemoMode: false,
          isOnboarded: false,
        }),
    }),
    {
      name: 'civicbridge-user',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        language: state.language,
        isAuthenticated: state.isAuthenticated,
        isOnboarded: state.isOnboarded,
        isDemoMode: state.isDemoMode,
        highContrastMode: state.highContrastMode,
      }),
    }
  )
);
