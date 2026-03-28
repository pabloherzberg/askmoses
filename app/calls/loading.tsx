function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className ?? ''}`}
      style={{ background: 'var(--am-bg4)' }}
    />
  )
}

export default function CallsLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-6 w-28 mb-1.5" />
        <Skeleton className="h-3 w-48" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Header row */}
        <div
          className="flex gap-4 px-4 py-3"
          style={{ borderBottom: '1px solid var(--am-border)' }}
        >
          {[140, 100, 80, 60, 50, 70, 20].map((w, i) => (
            <Skeleton key={i} className={`h-3`} style={{ width: w }} />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5"
            style={{ borderBottom: i < 7 ? '1px solid var(--am-border)' : 'none' }}
          >
            <div className="flex items-center gap-2.5" style={{ width: 140 }}>
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-5 w-8 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>
    </div>
  )
}
