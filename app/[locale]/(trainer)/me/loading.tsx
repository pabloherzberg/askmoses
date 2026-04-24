function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className ?? ''}`}
      style={{ background: 'var(--am-bg4)' }}
    />
  )
}

export default function MeLoading() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-6 w-40 mb-1.5" />
        <Skeleton className="h-3 w-52" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Rubric */}
        <div
          className="rounded-2xl p-5 border"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-3 w-56 mb-5" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mb-4">
              <Skeleton className="h-3 w-full mb-1.5" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {/* Coaching tip */}
          <div
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-4 w-56 mb-3" />
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-3 w-5/6 mb-1.5" />
            <Skeleton className="h-3 w-4/6" />
          </div>

          {/* Quick stats */}
          <div
            className="rounded-2xl p-5 border"
            style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
          >
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center">
                  <Skeleton className="h-8 w-10 mx-auto mb-1.5" />
                  <Skeleton className="h-3 w-14 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent calls */}
      <Skeleton className="h-3 w-28 mb-3.5" />
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-3.5"
            style={{ borderBottom: i < 5 ? '1px solid var(--am-border)' : 'none' }}
          >
            <Skeleton className="h-3 w-16 flex-shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-10 hidden sm:block" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-8 rounded-full" />
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>
    </div>
  )
}
