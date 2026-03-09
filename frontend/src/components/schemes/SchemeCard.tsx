import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Users, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EligibilityBadge } from './EligibilityBadge';
import { useLocalization } from '@/hooks/useLocalization';
import { CATEGORY_CONFIG } from '@/lib/constants';
import { formatCurrency, formatCurrencyEn } from '@/lib/utils';
import type { Scheme } from '@/types';

interface SchemeCardProps {
  scheme: Scheme;
  index?: number;
}

export const SchemeCard: React.FC<SchemeCardProps> = ({ scheme, index = 0 }) => {
  const navigate = useNavigate();
  const { t, isHindi } = useLocalization();
  const category = CATEGORY_CONFIG[scheme.category];

  const freqLabel = scheme.benefitFrequency === 'yearly'
    ? t('schemes.per_year')
    : scheme.benefitFrequency === 'monthly'
      ? t('schemes.per_month')
      : t('schemes.one_time');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Card
        variant="interactive"
        padding="none"
        onClick={() => navigate(`/schemes/${scheme.id}`)}
        className="overflow-hidden"
      >
        {/* Category Color Bar */}
        <div className="h-1.5" style={{ backgroundColor: category.color }} />

        <div className="p-4 space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  size="sm"
                  className="shrink-0"
                  style={{ backgroundColor: category.bg, color: category.color, borderColor: `${category.color}33` } as React.CSSProperties}
                >
                  {isHindi ? category.labelHi : category.label}
                </Badge>
                <EligibilityBadge score={scheme.eligibilityScore} size="sm" />
              </div>
              <h3 className="font-bold text-base text-text-primary line-clamp-2">
                {isHindi ? scheme.nameHi : scheme.name}
              </h3>
            </div>
          </div>

          {/* Benefit Amount */}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-green-dark">
              {isHindi ? formatCurrency(scheme.benefitAmount) : formatCurrencyEn(scheme.benefitAmount)}
            </span>
            <span className="text-sm text-text-muted">{freqLabel}</span>
          </div>

          {/* Eligibility Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-secondary">Eligibility Match</span>
              <span className="font-semibold">{scheme.eligibilityScore}%</span>
            </div>
            <ProgressBar
              value={scheme.eligibilityScore}
              variant={scheme.eligibilityScore >= 70 ? 'green' : 'saffron'}
              size="sm"
            />
          </div>

          {/* Info Row */}
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span className="flex items-center gap-1">
              <FileText size={14} />
              {scheme.requiredDocuments.length} docs
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              {scheme.successRate}% success
            </span>
            {scheme.deadline && (
              <span className="flex items-center gap-1 text-warning">
                <Clock size={14} />
                {new Date(scheme.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* CTA */}
          <Button
            size="md"
            fullWidth
            icon={<ArrowRight size={18} />}
            className="mt-2"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/schemes/${scheme.id}/apply`);
            }}
          >
            {t('schemes.apply_now')}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};
