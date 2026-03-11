import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Share2, BookmarkPlus, Users, Clock } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EligibilityBadge, EligibilityChecklist } from '@/components/schemes/EligibilityBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useSchemeStore } from '@/stores/schemeStore';
import { useLocalization } from '@/hooks/useLocalization';
import { CATEGORY_CONFIG, DOC_TYPE_CONFIG } from '@/lib/constants';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function SchemeDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { schemes } = useSchemeStore();
  const { language, t } = useLocalization();
  const [saved, setSaved] = useState(false);

  const scheme = schemes.find(s => s.id === id);
  if (!scheme) return (
    <AppShell title="Scheme Not Found" showBack>
      <div className="flex items-center justify-center h-64 text-slate-400">Scheme not found</div>
    </AppShell>
  );

  const cat = CATEGORY_CONFIG[scheme.category];
  const name = language === 'hi' ? scheme.nameHi : scheme.name;
  const desc = language === 'hi' ? scheme.descriptionHi : scheme.description;

  return (
    <AppShell
      title={name}
      showBack
      rightAction={
        <div className="flex gap-2">
          <button onClick={() => { setSaved(!saved); toast.success(saved ? 'Removed from saved' : 'Scheme saved!'); }}
            className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <BookmarkPlus className={cn('h-5 w-5', saved ? 'text-saffron-500 fill-saffron-100' : 'text-slate-400')} />
          </button>
          <button onClick={() => toast.success('Share link copied!')}
            className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <Share2 className="h-5 w-5 text-slate-400" />
          </button>
        </div>
      }
    >
      {/* Hero Banner */}
      <div className={cn('px-4 py-6 flex flex-col items-center text-center gap-2', cat.bg)}>
        <span className="text-5xl">{cat.icon}</span>
        <Badge variant="neutral" size="md">{language === 'hi' ? cat.labelHi : cat.label}</Badge>
        <h1 className="text-xl font-bold text-slate-900 mt-1">{name}</h1>
        <p className="text-xs text-slate-500">{scheme.ministry}</p>
        <EligibilityBadge score={scheme.eligibilityMatch} size="md" />
      </div>

      <div className="page-container pt-4 space-y-6">
        {/* Description */}
        <p className="text-base text-slate-600 leading-relaxed">{desc}</p>

        {/* Benefit amount */}
        {scheme.benefitAmount && (
          <div className="rounded-xl bg-india-green-50 border border-india-green-200 p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-india-green-100 flex items-center justify-center text-2xl">💰</div>
            <div>
              <p className="text-xs text-india-green-700 font-medium">{t('scheme.benefit')}</p>
              <p className="text-2xl font-bold text-india-green-700">{formatCurrency(scheme.benefitAmount)}</p>
              {scheme.benefitType === 'cash' && (
                <p className="text-xs text-india-green-600">per {t('common.year')}</p>
              )}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {scheme.applicationCount && (
            <div className="card p-3 text-center">
              <Users className="h-4 w-4 text-saffron-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">{(scheme.applicationCount/1000).toFixed(1)}K</p>
              <p className="text-xs text-slate-500">Applied</p>
            </div>
          )}
          {scheme.approvalRate && (
            <div className="card p-3 text-center">
              <span className="text-lg font-bold text-india-green-600 block">{scheme.approvalRate}%</span>
              <p className="text-xs text-slate-500">Approved</p>
            </div>
          )}
          {scheme.avgApprovalDays && (
            <div className="card p-3 text-center">
              <Clock className="h-4 w-4 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">{scheme.avgApprovalDays}d</p>
              <p className="text-xs text-slate-500">{t('scheme.avg_days')}</p>
            </div>
          )}
        </div>

        {/* Deadline */}
        {scheme.deadline && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">{t('scheme.deadline')}:</span> {formatDate(scheme.deadline)}
            </p>
          </div>
        )}

        {/* Eligibility checklist */}
        <div>
          <h2 className="section-title mb-3">Eligibility Criteria</h2>
          <EligibilityChecklist criteria={scheme.eligibilityCriteria} />
        </div>

        {/* Required documents */}
        <div>
          <h2 className="section-title mb-3">{t('scheme.required_docs')}</h2>
          <div className="space-y-2">
            {scheme.requiredDocs.map((docType) => {
              const d = DOC_TYPE_CONFIG[docType] ?? DOC_TYPE_CONFIG.other;
              return (
                <div key={docType} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xl">{d.icon}</span>
                  <p className="text-sm font-medium text-slate-800">
                    {language === 'hi' ? d.labelHi : d.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-4" />
      </div>

      {/* Sticky Apply Button */}
      <div className="fixed bottom-[80px] left-0 right-0 px-4 pb-2">
        <div className="max-w-content mx-auto">
          <Button
            variant="primary"
            size="lg"
            className="w-full shadow-lg"
            onClick={() => navigate(`/apply/${scheme.id}`)}
          >
            {t('common.apply_now')} 🚀
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
