import { motion } from 'framer-motion';
import { ChevronRight, Clock, FileCheck } from 'lucide-react';
import type { Scheme } from '@/types';
import { CATEGORY_CONFIG } from '@/lib/constants';
import { formatCurrency, formatDate, getEligibilityLabel, getEligibilityColor, cn } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLocalization } from '@/hooks/useLocalization';

interface SchemeCardProps {
  scheme: Scheme;
  onApply:  () => void;
  onDetail: () => void;
  compact?: boolean;
}

export function SchemeCard({ scheme, onApply, onDetail, compact }: SchemeCardProps) {
  const { t, language } = useLocalization();
  const cat = CATEGORY_CONFIG[scheme.category];
  const eligLabel = getEligibilityLabel(scheme.eligibilityMatch, language === 'hi' ? 'hi' : 'en');
  const eligColor = getEligibilityColor(scheme.eligibilityMatch);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-slate-100 shadow-sm active:shadow-none transition-shadow"
      onClick={onDetail}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={cn('flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center text-2xl', cat.bg)}>
            {cat.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                {language === 'hi' ? scheme.nameHi : scheme.name}
              </h3>
              <ChevronRight className="flex-shrink-0 h-4 w-4 text-slate-400 mt-0.5" />
            </div>
            <span className={cn('badge text-xs mt-1', cat.color, cat.bg)}>
              {language === 'hi' ? cat.labelHi : cat.label}
            </span>
          </div>
        </div>

        {/* Benefit amount */}
        {scheme.benefitAmount && (
          <div className="mt-3">
            <p className="text-xs text-slate-500">{t('scheme.benefit')}</p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(scheme.benefitAmount)}
              {scheme.benefitType === 'cash' && (
                <span className="text-sm font-medium text-slate-500 ml-1">/{t('common.year')}</span>
              )}
            </p>
          </div>
        )}

        {/* Eligibility bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">{t('scheme.eligibility')}</span>
            <Badge className={cn('text-xs', eligColor)}>{eligLabel}</Badge>
          </div>
          <ProgressBar value={scheme.eligibilityMatch} showValue size="sm" />
        </div>

        {!compact && (
          <>
            {/* Deadline */}
            {scheme.deadline && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <Clock className="h-3 w-3" />
                <span>{t('scheme.deadline')}: {formatDate(scheme.deadline)}</span>
              </div>
            )}

            {/* Required docs preview */}
            <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <FileCheck className="h-3 w-3" />
              <span>{scheme.requiredDocs.length} {t('scheme.required_docs')}</span>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="primary" size="sm" className="flex-1" onClick={onApply}>
            {t('common.apply_now')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDetail}>
            {t('scheme.how_to_apply')}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
