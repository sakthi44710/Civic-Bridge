import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ApplicationTimeline } from '@/components/tracking/ApplicationTimeline';
import { StatusBadge } from '@/components/tracking/StatusBadge';
import { CardSkeleton } from '@/components/ui/Progress';
import { useSchemeStore } from '@/stores/schemeStore';
import { useLocalization } from '@/hooks/useLocalization';
import type { Application } from '@/types';

const STATUS_SUMMARY_CONFIG = [
  { label: 'Applied', labelHi: 'आवेदित', status: 'applied', emoji: '📤', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  { label: 'Approved', labelHi: 'स्वीकृत', status: 'approved', emoji: '✅', color: 'bg-green-50 text-green-700 border-green-100' },
  { label: 'Pending', labelHi: 'लंबित', status: 'under_review', emoji: '⏳', color: 'bg-amber-50 text-amber-700 border-amber-100' },
  { label: 'Rejected', labelHi: 'अस्वीकृत', status: 'rejected', emoji: '❌', color: 'bg-red-50 text-red-700 border-red-100' },
];

function ApplicationCard({ application }: { application: Application }) {
  const { language } = useLocalization();
  const [expanded, setExpanded] = useState(false);
  const schemeName = language === 'hi' ? application.scheme?.nameHi ?? application.schemeId : application.scheme?.name ?? application.schemeId;

  return (
    <motion.div layout className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{schemeName}</p>
          <p className="text-xs text-slate-500 mt-0.5">Ref: {application.acknowledgementNo ?? '—'}</p>
          <div className="mt-2">
            <StatusBadge status={application.status} />
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0 ml-2" /> : <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0 ml-2" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="timeline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-slate-100 pt-4">
              <ApplicationTimeline
                stages={application.timeline}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function TrackingScreen() {
  const { applications, fetchApplications } = useSchemeStore();
  const { t, language } = useLocalization();

  useEffect(() => {
    fetchApplications();
  }, []);

  const counts = {
    applied: applications.filter(a => a.status === 'applied').length,
    approved: applications.filter(a => a.status === 'approved').length,
    under_review: applications.filter(a => a.status === 'under_review').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  } as Record<string, number>;

  return (
    <AppShell title={t('nav.tracking')}>
      <div className="px-5 pt-4 pb-28 space-y-5">
        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-3">
          {STATUS_SUMMARY_CONFIG.map((cfg) => (
            <div key={cfg.status} className={`rounded-2xl border p-4 ${cfg.color}`}>
              <p className="text-2xl">{cfg.emoji}</p>
              <p className="text-2xl font-bold mt-1">{counts[cfg.status] ?? 0}</p>
              <p className="text-xs font-semibold mt-0.5">{language === 'hi' ? cfg.labelHi : cfg.label}</p>
            </div>
          ))}
        </div>

        <h2 className="section-title">{t('tracking.my_applications') || 'My Applications'}</h2>

        {applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-5xl mb-4">📋</p>
            <p className="text-lg font-semibold text-slate-700">No applications yet</p>
            <p className="text-sm text-slate-500 mt-1">Apply to schemes and track progress here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app, i) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <ApplicationCard application={app} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
