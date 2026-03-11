import { CheckCircle2, XCircle, AlertCircle, HelpCircle } from 'lucide-react';
import type { Scheme } from '@/types';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

interface EligibilityBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function EligibilityBadge({ score, size = 'md', showIcon = true }: EligibilityBadgeProps) {
  const { language } = useLocalization();
  const isHi = language === 'hi';

  let config: { label: string; labelHi: string; icon: typeof CheckCircle2; classes: string };

  if (score >= 90)
    config = { label: 'Perfect Match', labelHi: 'बिल्कुल सही',  icon: CheckCircle2, classes: 'bg-india-green-50 text-india-green-700 border-india-green-300' };
  else if (score >= 70)
    config = { label: 'Likely Eligible', labelHi: 'संभवतः पात्र', icon: CheckCircle2, classes: 'bg-amber-50 text-amber-700 border-amber-300' };
  else if (score >= 50)
    config = { label: 'Check Details', labelHi: 'जांचें',        icon: AlertCircle,  classes: 'bg-orange-50 text-orange-700 border-orange-300' };
  else
    config = { label: 'Not Eligible',  labelHi: 'अपात्र',        icon: XCircle,      classes: 'bg-slate-100 text-slate-500 border-slate-200' };

  const Icon = config.icon;
  const sizeClasses = { sm: 'px-2 py-0.5 text-xs gap-1', md: 'px-3 py-1 text-sm gap-1.5', lg: 'px-4 py-1.5 text-base gap-2' };
  const iconSizes = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' };

  return (
    <span className={cn('inline-flex items-center rounded-full font-semibold border', sizeClasses[size], config.classes)}>
      {showIcon && <Icon className={iconSizes[size]} />}
      {isHi ? config.labelHi : config.label}
    </span>
  );
}

// ─── Eligibility Checklist ────────────────────────────────
interface EligibilityChecklistProps {
  criteria: Scheme['eligibilityCriteria'];
}

export function EligibilityChecklist({ criteria }: EligibilityChecklistProps) {
  const { language } = useLocalization();

  return (
    <div className="space-y-2">
      {criteria.map((c, i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
          {c.met ? (
            <CheckCircle2 className="h-5 w-5 text-india-green-500 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">
              {language === 'hi' ? c.labelHi : c.label}
            </p>
            {c.value && <p className="text-xs text-slate-500">{c.value}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
