import { forwardRef, type ReactNode } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  motionProps?: MotionProps;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-saffron text-white hover:bg-saffron-dark shadow-lg shadow-saffron/25',
  secondary: 'bg-navy text-white hover:bg-navy-dark shadow-lg shadow-navy/25',
  outline: 'border-2 border-saffron text-saffron hover:bg-saffron-light',
  ghost: 'text-text-secondary hover:bg-white/5',
  danger: 'bg-error text-white hover:bg-red-600',
  success: 'bg-green text-white hover:bg-green-dark shadow-lg shadow-green/25',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-sm rounded-sm gap-1.5',
  md: 'h-12 px-6 text-base rounded-sm gap-2 touch-target',
  lg: 'h-14 px-8 text-lg rounded-sm gap-2.5 touch-target-lg',
  xl: 'h-16 px-10 text-xl rounded-md gap-3 touch-target-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, fullWidth, className, children, disabled, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...(props as MotionProps)}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children as ReactNode}
    </motion.button>
  )
);
Button.displayName = 'Button';
