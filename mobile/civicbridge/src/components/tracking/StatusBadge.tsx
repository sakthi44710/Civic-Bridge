import { motion } from 'framer-motion';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Send } from 'lucide-react';
import type { ApplicationStatus } from '@/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useLocalization } from '@/hooks/useLocalization';

interface StatusBadgeProps {
  status: ApplicationStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  animate?: boolean;
}

const STATUS_ICON: Record<ApplicationStatus, typeof CheckCircle2> = {
  eligible:        CheckCircle2,
  applied:         Send,
  processing:      Clock,
  under_review:    Clock,
  approved:        CheckCircle2,
  rejected:        XCircle,
  action_required: AlertTriangle,
};

export function StatusBadge({ status, size = 'md', showIcon = true, animate: shouldAnimate = false }: StatusBadgeProps) {
  const { language } = useLocalization();
  const cfg = STATUS_CONFIG[status];
  const Icon = STATUS_ICON[status];

  const sizeClasses = {
    sm:  'px-2 py-0.5 text-xs gap-1',
    md:  'px-3 py-1 text-sm gap-1.5',
    lg:  'px-4 py-2 text-base gap-2',
  };
  const iconSizes = { sm: 'h-3 w-3', md: 'h-4 w-4', lg: 'h-5 w-5' };

  const Wrap = shouldAnimate ? motion.span : 'span';
  const animProps = shouldAnimate && status === 'approved'
    ? { animate: { scale: [1, 1.1, 1] }, transition: { duration: 0.5, delay: 0.3 } }
    : {};

  return (
    <Wrap
      {...(animProps as object)}
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        sizeClasses[size],
        cfg.color,
        cfg.bg,
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {language === 'hi' ? cfg.labelHi : cfg.label}
    </Wrap>
  );
}
