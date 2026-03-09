import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Globe, Bell } from 'lucide-react';
import { useLocalization } from '@/hooks/useLocalization';
import { useUserStore } from '@/stores/userStore';
import { LANGUAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/home': 'nav.home',
  '/voice': 'nav.voice',
  '/documents': 'nav.documents',
  '/profile': 'nav.profile',
  '/schemes': 'home.find_schemes',
  '/tracking': 'home.my_applications',
};

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLocalization();
  const { setLanguage } = useUserStore();
  const [showLangPicker, setShowLangPicker] = useState(false);

  const isHome = location.pathname === '/home';
  const titleKey = PAGE_TITLES[location.pathname] || '';
  const title = titleKey ? t(titleKey) : '';

  return (
    <>
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-lg border-b border-border safe-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-md mx-auto">
          <div className="flex items-center gap-2">
            {!isHome && (
              <button
                onClick={() => navigate(-1)}
                className="touch-target flex items-center justify-center rounded-full -ml-2"
                aria-label={t('common.back')}
              >
                <ArrowLeft size={22} className="text-text-primary" />
              </button>
            )}
            {isHome ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-saffron to-green flex items-center justify-center">
                  <span className="text-white font-bold text-sm">CB</span>
                </div>
                <span className="font-bold text-lg text-text-primary">CivicBridge</span>
              </div>
            ) : (
              <h1 className="font-semibold text-lg text-text-primary">{title}</h1>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLangPicker(true)}
              className="touch-target flex items-center justify-center gap-1 rounded-full px-2"
              aria-label="Change language"
            >
              <Globe size={18} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-secondary uppercase">{language}</span>
            </button>
            <button
              className="touch-target flex items-center justify-center rounded-full"
              aria-label="Notifications"
            >
              <Bell size={20} className="text-text-secondary" />
            </button>
          </div>
        </div>
      </header>

      {/* Language Picker Modal */}
      <AnimatePresence>
        {showLangPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowLangPicker(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-xl safe-bottom"
            >
              <div className="p-4">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
                <h2 className="text-lg font-bold text-text-primary mb-4">Select Language / भाषा चुनें</h2>
                <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pb-4">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLangPicker(false);
                      }}
                      className={cn(
                        'p-3 rounded-md border-2 text-left transition-all touch-target',
                        language === lang.code
                          ? 'border-saffron bg-saffron-light'
                          : 'border-border hover:border-saffron/30'
                      )}
                    >
                      <span className="text-lg font-bold block">{lang.nativeName}</span>
                      <span className="text-sm text-text-secondary">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
