import { trainerBehavioral, type BehavioralDimension } from '@/lib/mock-data'

interface BehavioralProfileProps {
  trainerKey: string
}

export function BehavioralProfile({ trainerKey }: BehavioralProfileProps) {
  const dimensions: BehavioralDimension[] = trainerBehavioral[trainerKey] ?? []

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Behavioral Correlation Profile
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{
            color: 'var(--am-amber)',
            borderColor: 'rgba(255,171,46,0.35)',
            background: 'rgba(255,171,46,0.08)',
          }}
        >
          mock data only
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'var(--am-green)' }} />
          Trainer score (above avg)
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'var(--am-amber)' }} />
          Trainer score (below avg)
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--am-muted)' }}>
          <span className="inline-block w-0.5 h-3" style={{ background: 'var(--am-muted)' }} />
          Team avg marker
        </span>
      </div>

      {/* Column headers */}
      <div className="grid items-center mb-2" style={{ gridTemplateColumns: '1fr 3.5rem 3.5rem 3.5rem' }}>
        <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>Score vs team avg</span>
        <span className="text-[11px] text-right" style={{ color: 'var(--am-muted)' }}>Score</span>
        <span className="text-[11px] text-right" style={{ color: 'var(--am-muted)' }}>Delta</span>
        <span className="text-[11px] text-right" style={{ color: 'var(--am-muted)' }}>Team avg</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2.5">
        {dimensions.map((dim) => {
          const isAbove = dim.delta >= 0
          const barColor = isAbove ? 'var(--am-green)' : 'var(--am-amber)'
          // marker position = teamAvg / 100 * 100% of bar width
          const markerPct = `${dim.teamAvg}%`
          const barWidth = `${dim.score}%`

          return (
            <div key={dim.dimension}>
              {/* Dimension name — full width on mobile only */}
              <span
                className="block sm:hidden text-[11px] font-medium mb-1"
                style={{ color: 'var(--am-text)' }}
              >
                {dim.dimension}
              </span>

              <div
                className="grid items-center"
                style={{ gridTemplateColumns: '1fr 3.5rem 3.5rem 3.5rem' }}
              >
                {/* Bar track (with label on sm+) */}
                <div className="flex flex-col gap-1 min-w-0 mr-3">
                  <span
                    className="hidden sm:block text-[12px] font-medium truncate"
                    style={{ color: 'var(--am-text)' }}
                  >
                    {dim.dimension}
                  </span>
                  <div className="relative h-3 rounded-full" style={{ background: 'var(--am-bg4)' }}>
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all"
                      style={{ width: barWidth, background: barColor, opacity: 0.85 }}
                    />
                    <div
                      className="absolute top-0 h-full w-px"
                      style={{ left: markerPct, background: 'var(--am-muted)', zIndex: 1 }}
                    />
                  </div>
                </div>

                {/* Score */}
                <span
                  className="text-[12px] font-mono font-semibold text-right"
                  style={{ color: 'var(--am-text)' }}
                >
                  {dim.score}
                </span>

                {/* Delta */}
                <span
                  className="text-[12px] font-mono font-semibold text-right"
                  style={{ color: isAbove ? 'var(--am-green)' : 'var(--am-amber)' }}
                >
                  {isAbove ? `+${dim.delta}` : dim.delta}
                </span>

                {/* Team avg */}
                <span
                  className="text-[12px] font-mono text-right"
                  style={{ color: 'var(--am-muted)' }}
                >
                  {dim.teamAvg}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-[10px]" style={{ color: 'var(--am-amber)' }}>
        † all values from mock-data.ts · green = above team avg · orange = below team avg · vertical marker = team avg · no real calculation
      </p>
    </div>
  )
}
