import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  color?: 'saffron' | 'green' | 'blue' | 'red' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showValue?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className,
  color = 'auto',
  size = 'md',
  label,
  showValue,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const autoColor =
    pct >= 90 ? 'bg-india-green-500' :
    pct >= 70 ? 'bg-amber-400' :
    pct >= 50 ? 'bg-orange-400' :
    'bg-slate-400';

  const colorMap = {
    saffron: 'bg-saffron-400',
    green:   'bg-india-green-500',
    blue:    'bg-blue-500',
    red:     'bg-red-500',
    auto:    autoColor,
  };

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1">
          {label    && <span className="text-xs text-slate-600">{label}</span>}
          {showValue && <span className="text-xs font-semibold text-slate-700">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={cn('w-full rounded-full bg-slate-100', heights[size])} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn('rounded-full transition-all duration-500 ease-out', heights[size], colorMap[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Skeleton Loaders ─────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer-bg rounded-md', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-2.5 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-16" />
      </div>
    </div>
  );
}
