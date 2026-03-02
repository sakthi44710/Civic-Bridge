/**
 * Reusable loading skeleton components
 */

export function DocumentSkeleton() {
  return (
    <div className="glass-button rounded-xl p-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 skeleton rounded" />
          <div className="h-2 w-1/2 skeleton rounded" />
        </div>
      </div>
    </div>
  );
}

export function ApplicationSkeleton() {
  return (
    <div className="glass-button rounded-xl p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="h-3 w-2/3 skeleton rounded" />
        <div className="h-4 w-12 skeleton rounded-full" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-2 w-16 skeleton rounded" />
        <div className="h-2 w-12 skeleton rounded" />
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl px-3 py-2 bg-[#00d4ff]/[0.06] border border-[#00d4ff]/[0.08] rounded-bl-lg">
        <div className="h-2 w-8 skeleton rounded mb-1" />
        <div className="space-y-1.5">
          <div className="h-2.5 w-48 skeleton rounded" />
          <div className="h-2.5 w-40 skeleton rounded" />
          <div className="h-2.5 w-44 skeleton rounded" />
        </div>
      </div>
    </div>
  );
}
