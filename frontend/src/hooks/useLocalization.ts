import { useCallback } from 'react';
import { useUserStore } from '@/stores/userStore';
import { TRANSLATIONS } from '@/lib/constants';
import type { Language } from '@/types';

export function useLocalization() {
  const { language, setLanguage } = useUserStore();

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const entry = TRANSLATIONS[key];
      if (!entry) return fallback || key;
      return entry[language] || entry['en'] || fallback || key;
    },
    [language]
  );

  const tWith = useCallback(
    (key: string, replacements: Record<string, string>): string => {
      let text = t(key);
      for (const [k, v] of Object.entries(replacements)) {
        text = text.replace(`{${k}}`, v);
      }
      return text;
    },
    [t]
  );

  const isHindi = language === 'hi';
  const isEnglish = language === 'en';

  const bilingual = useCallback(
    (en: string, hi: string): string => {
      if (language === 'hi') return hi;
      return en;
    },
    [language]
  );

  return { t, tWith, language, setLanguage: setLanguage as (lang: Language) => void, isHindi, isEnglish, bilingual };
}
