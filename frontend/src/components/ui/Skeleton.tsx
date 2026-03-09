import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

export const CardSkeleton: React.FC = () => (
  <div className="bg-surface rounded-md p-4 border border-border space-y-3">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-2 w-full" />
    <div className="flex gap-2 pt-2">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-10 w-24" />
    </div>
  </div>
);
