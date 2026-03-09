import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FileCheck, Clock, Share2, Download, CheckCircle, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EligibilityBadge } from '@/components/schemes/EligibilityBadge';
import { useSchemeStore } from '@/stores/schemeStore';
import { useLocalization } from '@/hooks/useLocalization';
import { CATEGORY_CONFIG, DOCUMENT_TYPES } from '@/lib/constants';
import { formatCurrency, formatCurrencyEn } from '@/lib/utils';

export const SchemeDetailScreen: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schemes } = useSchemeStore();
  const { t, isHindi, bilingual } = useLocalization();

  const scheme = schemes.find((s) => s.id === id);

  if (!scheme) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        Scheme not found
      </div>
    );
  }

  const category = CATEGORY_CONFIG[scheme.category];
  const freqLabel = scheme.benefitFrequency === 'yearly' ? t('schemes.per_year') : scheme.benefitFrequency === 'monthly' ? t('schemes.per_month') : t('schemes.one_time');

  return (
    <div className="pb-24 max-w-md mx-auto">
      {/* Hero */}
      <div className="p-4 space-y-4" style={{ background: `linear-gradient(135deg, ${category.bg}, white)` }}>
        <div className="flex items-center gap-2">
          <Badge
            className="text-white"
            style={{ backgroundColor: category.color } as React.CSSProperties}
          >
            {isHindi ? category.labelHi : category.label}
          </Badge>
          <EligibilityBadge score={scheme.eligibilityScore} />
        </div>

        <h1 className="text-2xl font-extrabold text-text-primary">
          {isHindi ? scheme.nameHi : scheme.name}
        </h1>

        <p className="text-sm text-text-secondary">
          {isHindi ? scheme.descriptionHi : scheme.description}
        </p>

        {/* Benefit */}
        <Card variant="elevated" padding="md" className="!bg-white">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-green-dark">
              {isHindi ? formatCurrency(scheme.benefitAmount) : formatCurrencyEn(scheme.benefitAmount)}
            </span>
            <span className="text-base text-text-muted">{freqLabel}</span>
          </div>
          <ProgressBar value={scheme.eligibilityScore} variant="gradient" size="md" showLabel className="mt-3" />
        </Card>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-surface rounded-md border border-border">
            <Users size={20} className="text-info mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">{scheme.successRate}%</p>
            <p className="text-xs text-text-muted">{bilingual('Success Rate', 'सफलता दर')}</p>
          </div>
          <div className="text-center p-3 bg-surface rounded-md border border-border">
            <FileCheck size={20} className="text-saffron mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">{scheme.requiredDocuments.length}</p>
            <p className="text-xs text-text-muted">{bilingual('Documents', 'दस्तावेज़')}</p>
          </div>
          <div className="text-center p-3 bg-surface rounded-md border border-border">
            <Calendar size={20} className="text-green mx-auto mb-1" />
            <p className="text-lg font-bold text-text-primary">
              {scheme.deadline ? new Date(scheme.deadline).toLocaleDateString('en-IN', { month: 'short' }) : '∞'}
            </p>
            <p className="text-xs text-text-muted">{bilingual('Deadline', 'समय सीमा')}</p>
          </div>
        </div>

        {/* Required Documents */}
        <div>
          <h3 className="font-bold text-base text-text-primary mb-3">
            {bilingual('Required Documents', 'आवश्यक दस्तावेज़')}
          </h3>
          <div className="space-y-2">
            {scheme.requiredDocuments.map((docType) => {
              const doc = DOCUMENT_TYPES[docType as keyof typeof DOCUMENT_TYPES] || DOCUMENT_TYPES.other;
              return (
                <motion.div
                  key={docType}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 p-3 bg-surface rounded-md border border-border"
                >
                  <div className="w-8 h-8 rounded-full bg-saffron-light flex items-center justify-center">
                    <FileCheck size={16} className="text-saffron" />
                  </div>
                  <span className="text-sm font-medium text-text-primary flex-1">
                    {isHindi ? doc.labelHi : doc.label}
                  </span>
                  <CheckCircle size={16} className="text-gray-300" />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Ministry */}
        <div className="text-sm text-text-muted">
          <Clock size={14} className="inline mr-1" />
          {scheme.ministry}
        </div>

        {/* Share */}
        <div className="flex gap-3">
          <Button variant="outline" size="md" icon={<Share2 size={16} />} className="flex-1">
            WhatsApp
          </Button>
          <Button variant="outline" size="md" icon={<Download size={16} />} className="flex-1">
            {bilingual('Download', 'डाउनलोड')}
          </Button>
        </div>
      </div>

      {/* Sticky Apply */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-md mx-auto">
          <Button
            size="xl"
            fullWidth
            icon={<ArrowRight size={20} />}
            onClick={() => navigate(`/schemes/${scheme.id}/apply`)}
          >
            {t('schemes.apply_now')}
          </Button>
        </div>
      </div>
    </div>
  );
};
