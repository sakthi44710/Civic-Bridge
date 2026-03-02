import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token, isAuthenticated: true });
  },
  
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },
  
  updateUser: (data) => {
    set((state) => {
      const updated = { ...state.user, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    });
  },
}));

export const useLanguageStore = create((set) => ({
  language: localStorage.getItem('language') || '',
  languageName: localStorage.getItem('languageName') || '',
  setLanguage: (lang, name) => {
    localStorage.setItem('language', lang);
    localStorage.setItem('languageName', name || lang);
    set({ language: lang, languageName: name || lang });
  },
}));

export const useVoiceStore = create((set) => ({
  status: 'idle', // idle | listening | speaking | paused | processing
  caption: '',
  captionLang: '',
  userDetails: {},
  screenshot: null,
  
  setStatus: (status) => set({ status }),
  setCaption: (caption, lang) => set({ caption, captionLang: lang || '' }),
  setUserDetails: (details) => set((state) => ({ 
    userDetails: { ...state.userDetails, ...details } 
  })),
  setScreenshot: (url) => set({ screenshot: url }),
  clearScreenshot: () => set({ screenshot: null }),
  reset: () => set({ 
    status: 'idle', caption: '', captionLang: '', screenshot: null 
  }),
}));
