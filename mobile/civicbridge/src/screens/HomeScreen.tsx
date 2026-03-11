import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, HelpCircle, ChevronRight, TrendingUp, Award } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { SchemeCard } from '@/components/schemes/SchemeCard';
import { StatusBadge } from '@/components/tracking/StatusBadge';
import { useVoice } from '@/hooks/useVoice';
import { useLocalization } from '@/hooks/useLocalization';
import { useSchemeStore } from '@/stores/schemeStore';
import { useUserStore } from '@/stores/userStore';
import { useDocumentStore } from '@/stores/documentStore';
import { formatCurrency } from '@/lib/utils';

const QUICK_ACTIONS = [
  { emoji: '🔍', label: 'Find Schemes', labelHi: 'योजनाएं खोजें', path: '/schemes', color: 'from-saffron-50 to-orange-50', border: 'border-saffron-100' },
  { emoji: '📋', label: 'Applications', labelHi: 'आवेदन', path: '/tracking', color: 'from-blue-50 to-indigo-50', border: 'border-blue-100' },
  { emoji: '📄', label: 'Documents', labelHi: 'दस्तावेज़', path: '/documents', color: 'from-emerald-50 to-green-50', border: 'border-emerald-100' },
  { emoji: '🤝', label: 'Get Help', labelHi: 'सहायता', path: '/voice', color: 'from-purple-50 to-fuchsia-50', border: 'border-purple-100' },
];

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function HomeScreen() {
  const navigate = useNavigate();
  const { t, greeting, language } = useLocalization();
  const { voiceState, handleOrbTap, transcript } = useVoice();
  const { user, fetchProfile } = useUserStore();
  const { schemes, applications, fetchSchemes, fetchApplications, fetchMatchedSchemes } = useSchemeStore();
  const { fetchDocuments } = useDocumentStore();

  useEffect(() => {
    fetchProfile();
    fetchMatchedSchemes();
    fetchApplications();
    fetchDocuments();
  }, []);

  const topSchemes = schemes.slice(0, 3);
  const pendingApps = applications.filter(a => a.status !== 'approved' && a.status !== 'rejected');
  const totalBenefit = schemes
    .filter(s => s.eligibilityMatch >= 70 && s.benefitAmount)
    .reduce((sum, s) => sum + (s.benefitAmount ?? 0), 0);

  return (
    <AppShell>
      <div className="px-5 pt-5 pb-28 space-y-6">
        {/* ── Greeting + avatar ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 font-medium">{greeting}</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
              {language === 'hi' ? (user?.nameHi ?? user?.name) : user?.name ?? 'User'}
            </h1>
            {user?.district && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <span>📍</span> {user.district}, {user.state}
              </p>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/profile')}
            className="h-12 w-12 rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-600 flex items-center justify-center text-lg font-bold text-white shadow-md"
          >
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </motion.button>
        </motion.div>

        {/* ── Benefit summary ── */}
        {totalBenefit > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-2xl bg-gradient-to-r from-saffron-500 via-saffron-400 to-india-green-500 p-5 text-white relative overflow-hidden"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-white/10" />
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 opacity-80" />
              <p className="text-sm font-medium opacity-90">You may be eligible for</p>
            </div>
            <p className="text-3xl font-extrabold tracking-tight">{formatCurrency(totalBenefit)}</p>
            <p className="text-sm opacity-80 mt-0.5">in annual government benefits</p>
          </motion.div>
        )}

        {/* ── Voice Orb ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.12, type: 'spring', damping: 14 }}
          className="flex flex-col items-center py-3"
        >
          <p className="text-sm text-slate-400 mb-4 font-medium">{t('voice.prompt')}</p>
          <VoiceOrb state={voiceState} onTap={handleOrbTap} transcript={transcript} size="lg" />
        </motion.div>

        {/* ── Quick actions ── */}
        <motion.div variants={stagger} initial="hidden" animate="show">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">{t('home.subtitle')}</h2>
          <div className="grid grid-cols-4 gap-2.5">
            {QUICK_ACTIONS.map(({ label, labelHi, path, emoji, color, border }) => (
              <motion.button
                key={path}
                variants={fadeUp}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b ${color} ${border} p-3 min-h-[84px] justify-center transition-shadow hover:shadow-sm`}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[11px] font-bold text-slate-600 leading-tight text-center">
                  {language === 'hi' ? labelHi : label}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── Pending apps ── */}
        {pendingApps.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('track.title')}</h2>
              <button onClick={() => navigate('/tracking')} className="text-xs text-saffron-500 font-bold flex items-center gap-0.5">
                {t('common.view_all')} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2.5">
              {pendingApps.slice(0, 2).map((app) => (
                <motion.button
                  key={app.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/tracking')}
                  className="w-full rounded-2xl bg-white border border-slate-100 p-4 flex items-center gap-3.5 text-left shadow-sm"
                >
                  <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">📋</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {language === 'hi' ? app.scheme.nameHi : app.scheme.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">#{app.acknowledgementNo?.slice(-8)}</p>
                  </div>
                  <StatusBadge status={app.status} size="sm" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Top schemes ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-saffron-500" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Top Schemes For You</h2>
            </div>
            <button onClick={() => navigate('/schemes')} className="text-xs text-saffron-500 font-bold flex items-center gap-0.5">
              {t('common.view_all')} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {topSchemes.map((scheme) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                onApply={() => navigate(`/apply/${scheme.id}`)}
                onDetail={() => navigate(`/schemes/${scheme.id}`)}
                compact
              />
            ))}
          </div>
        </motion.div>
      </div>
    </AppShell>
  );
}
