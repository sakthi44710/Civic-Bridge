import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Language } from '@/types';
import { DEMO_USER } from '@/lib/constants';
import { authApi, userApi, setToken, clearToken, getToken, type UserResponse } from '@/lib/api';

function mapUserResponse(u: UserResponse): User {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone_number || '',
    state: u.state,
    district: u.district,
    category: u.category,
    language: (u.preferred_language as Language) || 'hi',
    aadhaarNum: u.aadhaar_number,
    createdAt: u.created_at ? new Date(u.created_at) : new Date(),
  };
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  language: Language;
  darkMode: boolean;
  offlineMode: boolean;
  loading: boolean;
  error: string | null;
  setUser: (user: User) => void;
  setLanguage: (lang: Language) => void;
  setOnboarded: (v: boolean) => void;
  toggleDarkMode: () => void;
  setDarkMode: (v: boolean) => void;
  setOfflineMode: (v: boolean) => void;
  logout: () => void;
  loginAsDemo: () => void;
  // Real auth
  sendOtp: (phone: string) => Promise<boolean>;
  verifyOtp: (phone: string, otp: string) => Promise<boolean>;
  register: (data: { phone_number: string; name: string; preferred_language: string }) => Promise<boolean>;
  googleLogin: (idToken: string, name?: string, email?: string) => Promise<boolean>;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Record<string, unknown>) => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isOnboarded: false,
      language: 'hi',
      darkMode: false,
      offlineMode: false,
      loading: false,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: true }),
      setLanguage: (language) => set({ language }),
      setOnboarded: (isOnboarded) => set({ isOnboarded }),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      setDarkMode: (darkMode) => set({ darkMode }),
      setOfflineMode: (offlineMode) => set({ offlineMode }),

      logout: () => {
        clearToken();
        set({ user: null, isAuthenticated: false });
      },

      loginAsDemo: () =>
        set({
          user: { ...DEMO_USER, createdAt: new Date() },
          isAuthenticated: true,
          isOnboarded: true,
          language: 'hi',
        }),

      sendOtp: async (phone: string) => {
        set({ loading: true, error: null });
        try {
          await authApi.sendOtp(phone);
          set({ loading: false });
          return true;
        } catch (e: unknown) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },

      verifyOtp: async (phone: string, otp: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.verifyOtp(phone, otp);
          setToken(res.access_token);
          const user = mapUserResponse(res.user);
          set({ user, isAuthenticated: true, isOnboarded: true, loading: false, language: user.language });
          return true;
        } catch (e: unknown) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },

      register: async (data) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.register(data);
          setToken(res.access_token);
          const user = mapUserResponse(res.user);
          set({ user, isAuthenticated: true, isOnboarded: true, loading: false, language: user.language });
          return true;
        } catch (e: unknown) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },

      googleLogin: async (idToken: string, name?: string, email?: string) => {
        set({ loading: true, error: null });
        try {
          const { language } = get();
          const res = await authApi.googleAuth(idToken, name, email, language);
          setToken(res.access_token);
          const user = mapUserResponse(res.user);
          set({ user, isAuthenticated: true, isOnboarded: true, loading: false, language: user.language });
          return true;
        } catch (e: unknown) {
          set({ loading: false, error: (e as Error).message });
          return false;
        }
      },

      fetchProfile: async () => {
        try {
          const res = await userApi.getProfile();
          set({ user: mapUserResponse(res) });
        } catch {
          // Token may be invalid
        }
      },

      updateProfile: async (data) => {
        try {
          const res = await userApi.updateProfile(data);
          set({ user: mapUserResponse(res) });
        } catch {
          // silent fail
        }
      },

      restoreSession: async () => {
        const token = getToken();
        if (!token) return;
        const { isAuthenticated } = get();
        if (isAuthenticated) return;
        try {
          const res = await userApi.getProfile();
          set({ user: mapUserResponse(res), isAuthenticated: true, isOnboarded: true });
        } catch {
          clearToken();
        }
      },
    }),
    { name: 'civicbridge-user' }
  )
);
