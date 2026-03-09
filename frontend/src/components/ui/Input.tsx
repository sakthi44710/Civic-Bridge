import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, rightIcon, className, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">{icon}</div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-12 px-4 rounded-sm border border-border bg-surface text-text-primary',
            'text-base placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-saffron focus:border-saffron',
            'transition-colors touch-target',
            icon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-error focus:ring-error',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">{rightIcon}</div>
        )}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';
