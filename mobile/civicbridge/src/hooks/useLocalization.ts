import { useCallback } from 'react';
import { useUserStore } from '@/stores/userStore';
import { t, getGreeting } from '@/lib/i18n';
import type { Language } from '@/types';

export function useLocalization() {
  const { language, setLanguage } = useUserStore();

  const translate = useCallback(
    (key: string) => t(key, language as Language),
    [language]
  );

  const greeting = getGreeting(language as Language);

  return { t: translate, language: language as Language, setLanguage, greeting };
}
