import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, FileText, ClipboardList, HelpCircle, ChevronRight, TrendingUp, Bell } from 'lucide-react';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useLocalization } from '@/hooks/useLocalization';
import { useUserStore } from '@/stores/userStore';
import { useOffline } from '@/hooks/useOffline';
import { getTimeGreeting, cn } from '@/lib/utils';

const quickActions = [
  { icon: Search, labelKey: 'home.find_schemes', path: '/schemes', color: 'bg-saffron-light text-saffron' },
  { icon: ClipboardList, labelKey: 'home.my_applications', path: '/tracking', color: 'bg-green-light text-green' },
  { icon: FileText, labelKey: 'home.upload_documents', path: '/documents', color: 'bg-blue-50 text-info' },
  { icon: HelpCircle, labelKey: 'home.get_help', path: '/voice', color: 'bg-purple-50 text-purple-600' },
];

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t, bilingual } = useLocalization();
  const { user } = useUserStore();
  const { isOnline } = useOffline();
  const greeting = getTimeGreeting();

  return (
    <div className="px-4 py-5 pb-8 space-y-6 max-w-md mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <p className="text-base text-text-secondary">{t(`home.greeting_${greeting}`)}</p>
          <h2 className="text-xl font-bold text-text-primary">
            {user?.name || bilingual('Welcome!', 'स्वागत है!')}
          </h2>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full bg-gradient-to-r from-saffron to-green flex items-center justify-center"
        >
          <span className="text-white font-bold text-sm">
            {user?.name?.charAt(0) || 'U'}
          </span>
        </button>
      </motion.div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-sm text-yellow-700">{t('common.offline')}</span>
        </div>
      )}

      {/* Voice Orb - Center Stage */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center py-6"
      >
        <VoiceOrb size="lg" />
        <p className="text-sm text-text-muted mt-4 text-center max-w-xs">
          {bilingual(
            'Say "Mujhe scholarship chahiye" or tap the mic',
            '"मुझे स्कॉलरशिप चाहिए" बोलें या माइक टैप करें'
          )}
        </p>
      </motion.div>

      {/* Quick Actions Grid */}
      <div>
        <h3 className="font-bold text-base text-text-primary mb-3">
          {bilingual('Quick Actions', 'त्वरित कार्य')}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <motion.button
              key={action.path}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-2 p-4 bg-surface rounded-md border border-border hover:border-saffron/30 hover:shadow-sm transition-all touch-target"
            >
              <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', action.color)}>
                <action.icon size={22} />
              </div>
              <span className="text-sm font-medium text-text-primary text-center">{t(action.labelKey)}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Featured Scheme Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card
          variant="interactive"
          padding="none"
          className="overflow-hidden bg-gradient-to-r from-saffron/10 to-green/10"
          onClick={() => navigate('/schemes')}
        >
          <div className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-saffron-light flex items-center justify-center shrink-0">
              <TrendingUp size={22} className="text-saffron" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-text-primary">
                {bilingual('6 Schemes Available', '6 योजनाएं उपलब्ध')}
              </h4>
              <p className="text-xs text-text-secondary">
                {bilingual('Based on your profile, you may be eligible', 'आपकी प्रोफाइल के अनुसार पात्र हो सकते हैं')}
              </p>
            </div>
            <ChevronRight size={20} className="text-text-muted" />
          </div>
        </Card>
      </motion.div>

      {/* Recent Activity */}
      <div>
        <h3 className="font-bold text-base text-text-primary mb-3">
          {bilingual('Recent Activity', 'हाल की गतिविधि')}
        </h3>
        <Card variant="default" padding="md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-light flex items-center justify-center">
              <Bell size={18} className="text-green" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                {bilingual('Welcome to CivicBridge!', 'CivicBridge में आपका स्वागत है!')}
              </p>
              <p className="text-xs text-text-muted">
                {bilingual('Start by uploading your Aadhaar card', 'अपना आधार कार्ड अपलोड करके शुरू करें')}
              </p>
            </div>
            <Badge variant="saffron" size="sm">New</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
};
