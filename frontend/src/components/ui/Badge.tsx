import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'saffron' | 'green' | 'navy';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  saffron: 'bg-saffron-light text-saffron-dark border-saffron/20',
  green: 'bg-green-light text-green-dark border-green/20',
  navy: 'bg-navy-light text-navy-dark border-navy/20',
};

const sizeStyles = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', size = 'md', className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 font-medium rounded-full border',
      variantStyles[variant],
      sizeStyles[size],
      className
    )}
    {...props}
  >
    {children}
  </span>
);
