import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, ChevronRight, Globe, Bell, Shield, HelpCircle, Info, LogOut,
  Moon, Volume2, UserPlus, Smartphone, Eye
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useUserStore } from '@/stores/userStore';
import { useLocalization } from '@/hooks/useLocalization';
import { LANGUAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface SettingItemProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({ icon, label, description, onClick, trailing, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors rounded-md touch-target',
      danger && 'text-error'
    )}
  >
    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', danger ? 'bg-red-50' : 'bg-gray-100')}>
      {icon}
    </div>
    <div className="flex-1 text-left">
      <p className={cn('text-sm font-medium', danger ? 'text-error' : 'text-text-primary')}>{label}</p>
      {description && <p className="text-xs text-text-muted">{description}</p>}
    </div>
    {trailing || <ChevronRight size={16} className="text-text-muted" />}
  </button>
);

export const ProfileScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, language, highContrastMode, setHighContrastMode, logout, isDemoMode } = useUserStore();
  const { bilingual } = useLocalization();
  const [showLang, setShowLang] = useState(false);
  const { setLanguage } = useUserStore();

  const currentLang = LANGUAGES.find((l) => l.code === language);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="px-4 py-4 pb-8 space-y-4 max-w-md mx-auto">
      {/* Profile Card */}
      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-saffron to-green flex items-center justify-center">
            <span className="text-white text-2xl font-bold">
              {user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-text-primary">
              {user?.name || bilingual('Demo User', 'डेमो उपयोगकर्ता')}
            </h2>
            <p className="text-sm text-text-secondary">{user?.phone || '+91 98765 43210'}</p>
            <div className="flex gap-2 mt-1">
              {isDemoMode && <Badge variant="saffron" size="sm">Demo Mode</Badge>}
              {user?.verified && <Badge variant="success" size="sm">✓ Verified</Badge>}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal */}
      <Card variant="default" padding="none">
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {bilingual('Personal', 'व्यक्तिगत')}
          </h3>
        </div>
        <SettingItem
          icon={<User size={18} className="text-text-secondary" />}
          label={bilingual('Edit Profile', 'प्रोफाइल संपादित करें')}
        />
        <SettingItem
          icon={<UserPlus size={18} className="text-text-secondary" />}
          label={bilingual('Family Members', 'परिवार के सदस्य')}
          description={bilingual('Add or manage family', 'परिवार जोड़ें या प्रबंधित करें')}
        />
      </Card>

      {/* Preferences */}
      <Card variant="default" padding="none">
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {bilingual('Preferences', 'प्राथमिकताएं')}
          </h3>
        </div>
        <SettingItem
          icon={<Globe size={18} className="text-text-secondary" />}
          label={bilingual('Language', 'भाषा')}
          trailing={
            <span className="text-sm text-saffron font-medium">
              {currentLang?.nativeName}
            </span>
          }
          onClick={() => setShowLang(!showLang)}
        />
        {showLang && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="px-4 pb-3"
          >
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { setLanguage(lang.code); setShowLang(false); }}
                  className={cn(
                    'p-2 rounded-md border text-left text-sm',
                    language === lang.code ? 'border-saffron bg-saffron-light' : 'border-border'
                  )}
                >
                  <span className="font-bold block">{lang.nativeName}</span>
                  <span className="text-xs text-text-muted">{lang.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        <SettingItem
          icon={<Bell size={18} className="text-text-secondary" />}
          label={bilingual('Notifications', 'सूचनाएं')}
          description="WhatsApp, SMS, Push"
        />
        <SettingItem
          icon={<Eye size={18} className="text-text-secondary" />}
          label={bilingual('High Contrast', 'उच्च कंट्रास्ट')}
          trailing={
            <button
              onClick={() => setHighContrastMode(!highContrastMode)}
              className={cn(
                'w-10 h-6 rounded-full transition-colors',
                highContrastMode ? 'bg-saffron' : 'bg-gray-300'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full bg-white shadow transition-transform',
                highContrastMode ? 'translate-x-4.5' : 'translate-x-0.5'
              )} />
            </button>
          }
        />
        <SettingItem
          icon={<Volume2 size={18} className="text-text-secondary" />}
          label={bilingual('Voice-Only Mode', 'केवल आवाज़ मोड')}
          description={bilingual('For visually impaired users', 'दृष्टिबाधित उपयोगकर्ताओं के लिए')}
        />
        <SettingItem
          icon={<Smartphone size={18} className="text-text-secondary" />}
          label={bilingual('Cyber Cafe Mode', 'साइबर कैफे मोड')}
          description={bilingual('Auto-logout, no data saved', 'ऑटो-लॉगआउट, कोई डेटा सहेजा नहीं')}
        />
      </Card>

      {/* Privacy & Support */}
      <Card variant="default" padding="none">
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {bilingual('Support', 'सहायता')}
          </h3>
        </div>
        <SettingItem
          icon={<Shield size={18} className="text-text-secondary" />}
          label={bilingual('Data & Privacy', 'डेटा और गोपनीयता')}
        />
        <SettingItem
          icon={<HelpCircle size={18} className="text-text-secondary" />}
          label={bilingual('Help & Support', 'मदद और सहायता')}
        />
        <SettingItem
          icon={<Info size={18} className="text-text-secondary" />}
          label={bilingual('About CivicBridge', 'CivicBridge के बारे में')}
          description="v1.0.0 • AWS AI for Bharat"
        />
      </Card>

      {/* Logout */}
      <Card variant="default" padding="none">
        <SettingItem
          icon={<LogOut size={18} className="text-error" />}
          label={bilingual('Logout', 'लॉग आउट')}
          danger
          onClick={handleLogout}
        />
      </Card>
    </div>
  );
};
