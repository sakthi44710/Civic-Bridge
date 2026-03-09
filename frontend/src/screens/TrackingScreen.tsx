import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, FileCheck, Clock, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/tracking/StatusBadge';
import { ApplicationTimeline } from '@/components/tracking/ApplicationTimeline';
import { useLocalization } from '@/hooks/useLocalization';
import type { TimelineEvent } from '@/types';

const demoApplications = [
  {
    id: '1',
    schemeName: 'PM-KISAN Samman Nidhi',
    schemeNameHi: 'पीएम-किसान सम्मान निधि',
    status: 'approved' as const,
    refNumber: 'PMKISAN-2026-001234',
    date: '2026-02-15',
  },
  {
    id: '2',
    schemeName: 'PM Scholarship Scheme',
    schemeNameHi: 'पीएम छात्रवृत्ति योजना',
    status: 'processing' as const,
    refNumber: 'PMSCH-2026-005678',
    date: '2026-02-20',
  },
  {
    id: '3',
    schemeName: 'Ayushman Bharat - PMJAY',
    schemeNameHi: 'आयुष्मान भारत - पीएमजेएवाई',
    status: 'action_required' as const,
    refNumber: 'PMJAY-2026-009012',
    date: '2026-02-25',
  },
];

const demoTimeline: TimelineEvent[] = [
  {
    id: '1',
    title: 'Application Submitted',
    titleHi: 'आवेदन जमा किया गया',
    description: 'Your application has been submitted successfully',
    descriptionHi: 'आपका आवेदन सफलतापूर्वक जमा किया गया है',
    status: 'completed',
    timestamp: new Date('2026-02-15'),
  },
  {
    id: '2',
    title: 'Documents Verified',
    titleHi: 'दस्तावेज़ सत्यापित',
    description: 'All uploaded documents have been verified',
    descriptionHi: 'सभी अपलोड किए गए दस्तावेज़ सत्यापित हो गए हैं',
    status: 'completed',
    timestamp: new Date('2026-02-18'),
  },
  {
    id: '3',
    title: 'Under Review',
    titleHi: 'समीक्षा में',
    description: 'Application is being reviewed by district office',
    descriptionHi: 'आवेदन की जिला कार्यालय द्वारा समीक्षा की जा रही है',
    status: 'current',
    timestamp: new Date('2026-02-22'),
  },
  {
    id: '4',
    title: 'Final Approval',
    titleHi: 'अंतिम अनुमोदन',
    description: 'Awaiting final approval from state authority',
    descriptionHi: 'राज्य प्राधिकरण से अंतिम अनुमोदन की प्रतीक्षा',
    status: 'pending',
  },
  {
    id: '5',
    title: 'Benefit Disbursed',
    titleHi: 'लाभ वितरित',
    description: 'Amount will be credited to your bank account',
    descriptionHi: 'राशि आपके बैंक खाते में जमा की जाएगी',
    status: 'pending',
  },
];

export const TrackingScreen: React.FC = () => {
  const { t, bilingual, isHindi } = useLocalization();
  const [selectedApp, setSelectedApp] = React.useState<string | null>(null);

  const stats = [
    { label: t('tracking.applied'), value: 3, icon: FileCheck, color: 'text-info', bg: 'bg-blue-50' },
    { label: t('tracking.approved'), value: 1, icon: CheckCircle, color: 'text-green', bg: 'bg-green-50' },
    { label: t('tracking.pending'), value: 1, icon: Clock, color: 'text-warning', bg: 'bg-yellow-50' },
    { label: t('tracking.rejected'), value: 0, icon: XCircle, color: 'text-error', bg: 'bg-red-50' },
  ];

  return (
    <div className="px-4 py-4 pb-8 space-y-6 max-w-md mx-auto">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-center p-3 bg-surface rounded-md border border-border"
            >
              <Icon size={20} className={`${stat.color} mx-auto mb-1`} />
              <p className="text-xl font-extrabold text-text-primary">{stat.value}</p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Applications */}
      <div>
        <h3 className="font-bold text-base text-text-primary mb-3">
          {bilingual('Your Applications', 'आपके आवेदन')}
        </h3>
        <div className="space-y-3">
          {demoApplications.map((app, i) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
            >
              <Card
                variant="interactive"
                padding="md"
                onClick={() => setSelectedApp(selectedApp === app.id ? null : app.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-text-primary truncate">
                      {isHindi ? app.schemeNameHi : app.schemeName}
                    </h4>
                    <p className="text-xs text-text-muted mt-0.5">Ref: {app.refNumber}</p>
                    <p className="text-xs text-text-muted">{new Date(app.date).toLocaleDateString('en-IN')}</p>
                  </div>
                  <StatusBadge status={app.status} size="sm" showAnimation={app.status === 'approved'} />
                  <ChevronRight size={16} className="text-text-muted" />
                </div>

                {/* Timeline when selected */}
                {selectedApp === app.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-4 pt-4 border-t border-border"
                  >
                    <ApplicationTimeline events={demoTimeline} />
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" icon={<Download size={14} />} className="flex-1">
                        {bilingual('Receipt', 'रसीद')}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Action Required Alert */}
      <Card variant="default" padding="md" className="border-warning/30 bg-yellow-50/50">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm text-text-primary">
              {bilingual('Action Required', 'कार्रवाई आवश्यक')}
            </h4>
            <p className="text-xs text-text-secondary mt-1">
              {bilingual(
                'Your Ayushman Bharat application requires additional income certificate. Upload before March 5.',
                'आपके आयुष्मान भारत आवेदन में अतिरिक्त आय प्रमाण पत्र की आवश्यकता है। 5 मार्च से पहले अपलोड करें।'
              )}
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              {bilingual('Upload Now', 'अभी अपलोड करें')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
