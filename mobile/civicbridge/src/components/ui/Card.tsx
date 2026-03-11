import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevated?: boolean;
  noPadding?: boolean;
}

export function Card({ className, interactive, elevated, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white border border-slate-100',
        elevated ? 'shadow-card-hover' : 'shadow-card',
        !noPadding && 'p-4',
        interactive && 'cursor-pointer transition-shadow duration-200 hover:shadow-card-hover active:scale-[0.98]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-bold text-slate-900', className)} {...props}>{children}</h3>;
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-2', className)} {...props}>{children}</div>;
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 pt-3 border-t border-slate-100 flex items-center gap-2', className)} {...props}>{children}</div>;
}
