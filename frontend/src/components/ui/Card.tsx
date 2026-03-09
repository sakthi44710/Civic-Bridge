import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', animate = true, className, children, ...props }, ref) => {
    const base = cn(
      'bg-surface rounded-md',
      variant === 'default' && 'shadow-sm border border-border',
      variant === 'elevated' && 'shadow-lg',
      variant === 'outlined' && 'border-2 border-border',
      variant === 'interactive' && 'shadow-sm border border-border hover:shadow-md hover:border-saffron/30 transition-all cursor-pointer active:scale-[0.98]',
      paddings[padding],
      className
    );

    if (animate) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={base}
          {...(props as Record<string, unknown>)}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div ref={ref} className={base} {...props}>
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';
