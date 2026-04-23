function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className ?? ''}`}
      style={{ background: 'var(--am-bg4)' }}
    />
  )
}

export default function OverviewLoading() {
  return (
    <div>
      {/* Section label */}
      <Skeleton className="h-3 w-28 mb-3.5" />

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <Skeleton className="h-4 w-32 mb-5" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: i < 3 ? '1px solid var(--am-border)' : 'none' }}>
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-24 mb-1.5" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <Skeleton className="h-4 w-28 mb-5" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Chart grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <Skeleton className="h-4 w-40 mb-5" />
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-full mb-3.5" />
            ))}
          </div>
        ))}
      </div>

      {/* Insights */}
      <Skeleton className="h-3 w-24 mb-3.5" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <div className="flex gap-2.5 mb-3">
              <Skeleton className="w-6 h-6 rounded flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-full mb-2" />
                <Skeleton className="h-3 w-20 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-3 w-5/6 mb-4" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
