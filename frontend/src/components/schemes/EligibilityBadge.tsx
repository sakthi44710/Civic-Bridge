import React from 'react';
import { Check, TrendingUp, Search, X } from 'lucide-react';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';

interface EligibilityBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const EligibilityBadge: React.FC<EligibilityBadgeProps> = ({ score, size = 'md', showLabel = true }) => {
  const { t } = useLocalization();

  const config = score >= 90
    ? { color: 'text-green-700 bg-green-50 border-green-200', icon: Check, labelKey: 'eligibility.perfect' }
    : score >= 70
      ? { color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: TrendingUp, labelKey: 'eligibility.likely' }
      : score >= 50
        ? { color: 'text-orange-700 bg-orange-50 border-orange-200', icon: Search, labelKey: 'eligibility.check' }
        : { color: 'text-gray-500 bg-gray-50 border-gray-200', icon: X, labelKey: 'eligibility.not_eligible' };

  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5 gap-0.5' : size === 'lg' ? 'text-base px-3 py-1.5 gap-2' : 'text-sm px-2 py-1 gap-1';

  return (
    <span className={cn('inline-flex items-center font-medium rounded-full border', config.color, sizeClasses)}>
      <Icon size={size === 'sm' ? 10 : size === 'lg' ? 16 : 12} />
      {showLabel && t(config.labelKey)}
    </span>
  );
};
