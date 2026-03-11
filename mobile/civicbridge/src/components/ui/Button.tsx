import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation';

    const variants = {
      primary:   'bg-saffron-400 text-white hover:bg-saffron-500 active:bg-saffron-600 shadow-sm focus-visible:ring-saffron-400',
      secondary: 'border-2 border-saffron-400 text-saffron-500 bg-white hover:bg-saffron-50 active:bg-saffron-100 focus-visible:ring-saffron-400',
      ghost:     'text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-slate-400',
      success:   'bg-india-green-500 text-white hover:bg-india-green-600 active:bg-india-green-700 shadow-sm focus-visible:ring-india-green-500',
      danger:    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-sm focus-visible:ring-red-500',
      outline:   'border-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-slate-400',
    };

    const sizes = {
      sm:   'rounded-md px-4 py-2 text-sm min-h-[40px]',
      md:   'rounded-md px-6 py-3 text-base min-h-[52px]',
      lg:   'rounded-lg px-8 py-4 text-lg min-h-[60px]',
      icon: 'rounded-md p-3 min-h-[48px] min-w-[48px]',
    };

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || loading ? 1 : 0.96 }}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon}
        {children}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';
