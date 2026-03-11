import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelHi?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  lang?: 'en' | 'hi';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, labelHi, error, hint, leftIcon, rightIcon, lang = 'en', id, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`;
    const displayLabel = lang === 'hi' && labelHi ? labelHi : label;

    return (
      <div className="w-full space-y-1">
        {displayLabel && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">
            {displayLabel}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-md border-2 bg-white px-4 py-3 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400',
              error ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-saffron-400',
              leftIcon  && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            style={{ minHeight: 52 }}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-600">{error}</p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
