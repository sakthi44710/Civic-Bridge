import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Clock, AlertTriangle, PartyPopper } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useLocalization } from '@/hooks/useLocalization';
import type { ApplicationStatus } from '@/types';

interface StatusBadgeProps {
  status: ApplicationStatus;
  size?: 'sm' | 'md' | 'lg';
  showAnimation?: boolean;
}

const statusConfig: Record<ApplicationStatus, {
  variant: 'success' | 'error' | 'warning' | 'info' | 'default';
  icon: React.FC<{ size?: number }>;
  labelKey: string;
}> = {
  draft: { variant: 'default', icon: Clock, labelKey: 'Draft' },
  documents_pending: { variant: 'warning', icon: AlertTriangle, labelKey: 'Docs Pending' },
  submitted: { variant: 'info', icon: Clock, labelKey: 'Submitted' },
  processing: { variant: 'info', icon: Clock, labelKey: 'Processing' },
  verification: { variant: 'warning', icon: AlertTriangle, labelKey: 'Verifying' },
  approved: { variant: 'success', icon: Check, labelKey: 'tracking.approved' },
  rejected: { variant: 'error', icon: X, labelKey: 'tracking.rejected' },
  action_required: { variant: 'warning', icon: AlertTriangle, labelKey: 'Action Needed' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', showAnimation = false }) => {
  const { t } = useLocalization();
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={showAnimation ? { scale: 0.8, opacity: 0 } : undefined}
      animate={showAnimation ? { scale: 1, opacity: 1 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    >
      <Badge variant={config.variant} size={size}>
        <Icon size={size === 'sm' ? 10 : size === 'lg' ? 16 : 12} />
        {t(config.labelKey, config.labelKey)}
        {status === 'approved' && showAnimation && (
          <motion.span
            animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.5 }}
          >
            <PartyPopper size={14} />
          </motion.span>
        )}
      </Badge>
    </motion.div>
  );
};
