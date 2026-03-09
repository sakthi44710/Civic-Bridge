import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'saffron' | 'green' | 'blue' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'saffron',
  size = 'md',
  showLabel = false,
  className,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const barColors = {
    saffron: 'bg-saffron',
    green: 'bg-green',
    blue: 'bg-info',
    gradient: 'bg-gradient-to-r from-saffron to-green',
  };

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1 text-sm">
          <span className="text-text-secondary">Progress</span>
          <span className="font-semibold text-text-primary">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', heights[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', barColors[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
