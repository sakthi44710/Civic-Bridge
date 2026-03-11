import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe, Bell, Moon, Shield, HelpCircle,
  ChevronRight, LogOut, CheckCircle2, Languages,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useUserStore } from '@/stores/userStore';
import { useLocalization } from '@/hooks/useLocalization';
import { LANGUAGES } from '@/lib/constants';
import type { Language } from '@/types';

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  toggle?: { checked: boolean; onChange: () => void };
  danger?: boolean;
}

function SettingRow({ icon, label, value, onClick, toggle, danger }: SettingRowProps) {
  return (
    <button
      disabled={!onClick && !toggle}
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-4 active:bg-slate-50 transition-colors text-left disabled:cursor-default"
    >
      <span className={danger ? 'text-red-400' : 'text-slate-400'}>{icon}</span>
      <span className={`flex-1 text-sm font-semibold ${danger ? 'text-red-500' : 'text-slate-700'}`}>{label}</span>
      {value && <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2.5 py-1 rounded-full">{value}</span>}
      {toggle && (
        <div
          onClick={e => { e.stopPropagation(); toggle.onChange(); }}
          className={`w-12 h-7 rounded-full transition-colors ${toggle.checked ? 'bg-saffron-500' : 'bg-slate-200'} flex items-center px-1`}
        >
          <motion.div
            animate={{ x: toggle.checked ? 20 : 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="w-5 h-5 rounded-full bg-white shadow-sm"
          />
        </div>
      )}
      {onClick && !toggle && <ChevronRight className="h-4 w-4 text-slate-300" />}
    </button>
  );
}

export function ProfileScreen() {
  const { user, language, darkMode, setLanguage, setDarkMode, logout } = useUserStore();
  const { t } = useLocalization();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const displayLang = LANGUAGES.find(l => l.code === language);

  return (
    <AppShell title={t('nav.profile')}>
      <div className="px-5 pt-5 pb-28 space-y-5">
        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-2xl text-white font-bold flex-shrink-0 shadow-md">
              {user?.name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-slate-900 truncate">{user?.name ?? 'User'}</p>
              <p className="text-sm text-slate-400">{user?.phone ?? user?.email ?? '—'}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2.5 py-0.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600 font-semibold">Verified</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { emoji: '📄', count: '—', label: 'Documents' },
            { emoji: '📋', count: '—', label: 'Applications' },
            { emoji: '🏛️', count: '—', label: 'Schemes' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white border border-slate-100 p-3.5 text-center shadow-sm">
              <span className="text-xl">{stat.emoji}</span>
              <p className="text-lg font-bold text-slate-800 mt-1">{stat.count}</p>
              <p className="text-[11px] text-slate-400 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Preferences */}
        <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Preferences</p>
          </div>
          <SettingRow
            icon={<Globe className="h-5 w-5" />}
            label="Language"
            value={displayLang?.nativeName ?? language}
            onClick={() => setShowLangPicker(true)}
          />
          <div className="mx-4 border-t border-slate-50" />
          <SettingRow
            icon={<Moon className="h-5 w-5" />}
            label="Dark Mode"
            toggle={{ checked: darkMode, onChange: () => setDarkMode(!darkMode) }}
          />
          <div className="mx-4 border-t border-slate-50" />
          <SettingRow
            icon={<Bell className="h-5 w-5" />}
            label="Notifications"
            toggle={{ checked: true, onChange: () => {} }}
          />
        </div>

        {/* Account */}
        <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Account</p>
          </div>
          <SettingRow icon={<Shield className="h-5 w-5" />} label="Privacy & Security" onClick={() => {}} />
          <div className="mx-4 border-t border-slate-50" />
          <SettingRow icon={<HelpCircle className="h-5 w-5" />} label="Help & Support" onClick={() => {}} />
        </div>

        {/* Your information */}
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Information</p>
          {[
            ['State', user?.state ?? '—'],
            ['District', user?.district ?? '—'],
            ['Category', user?.category ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-sm text-slate-400">{k}</span>
              <span className="text-sm font-semibold text-slate-700">{v as string}</span>
            </div>
          ))}
        </div>

        {/* App info */}
        <div className="text-center space-y-1 pt-2">
          <p className="text-sm font-bold text-slate-300">CivicBridge v1.0.0</p>
          <p className="text-xs text-slate-300">AWS AI for Bharat Hackathon 2024</p>
        </div>

        {/* Logout */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={logout}
          className="w-full h-12 rounded-2xl border-2 border-red-200 bg-red-50 flex items-center justify-center gap-2 text-red-500 font-bold text-sm"
        >
          <LogOut className="h-4 w-4" />
          {t('profile.logout') || 'Logout'}
        </motion.button>
      </div>

      {/* Language picker bottom sheet */}
      {showLangPicker && (
        <motion.div
          key="lang-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowLangPicker(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="w-full bg-white rounded-t-3xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold mb-4">Choose Language / भाषा चुनें</h3>
            <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { setLanguage(lang.code as Language); setShowLangPicker(false); }}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                    language === lang.code
                      ? 'border-saffron-500 bg-saffron-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800">{lang.nativeName}</p>
                    <p className="text-xs text-slate-400">{lang.name}</p>
                  </div>
                  {language === lang.code && <CheckCircle2 className="h-4 w-4 text-saffron-500 ml-auto" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AppShell>
  );
}
