import { trainerTrends, type BehavioralTrendDimension } from '@/lib/mock-data'

function scoreColor(score: number) {
  if (score >= 75) return 'var(--am-green)'
  if (score >= 60) return 'var(--am-amber)'
  return 'var(--am-red)'
}

function Sparkline({ trend }: { trend: number[] }) {
  const W = 200
  const H = 28
  const min = Math.min(...trend) - 4
  const max = Math.max(...trend) + 4
  const range = max - min || 1

  const points = trend
    .map((v, i) => {
      const x = (i / (trend.length - 1)) * W
      const y = H - ((v - min) / range) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const last = trend[trend.length - 1]
  const color = scoreColor(last)

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  )
}

interface Props {
  trainerKey: string
}

export function BehavioralTrends({ trainerKey }: Props) {
  const dimensions: BehavioralTrendDimension[] = trainerTrends[trainerKey] ?? []

  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Behavioral Trends — 6 Weeks
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

      {/* Column headers */}
      <div
        className="grid items-center mb-2 gap-3"
        style={{ gridTemplateColumns: '1fr 3rem' }}
      >
        <span className="text-[10px] font-medium" style={{ color: 'var(--am-muted)' }}>6-week trend</span>
        <span className="text-[10px] font-medium text-right" style={{ color: 'var(--am-muted)' }}>Now</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {dimensions.map((dim, i) => (
          <div
            key={dim.dimension}
            className="py-2.5"
            style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
          >
            {/* Dimension name — full width on mobile */}
            <span
              className="block sm:hidden text-[11px] font-medium mb-1"
              style={{ color: 'var(--am-text)' }}
            >
              {dim.dimension}
            </span>

            <div className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr 3rem' }}>
              {/* Sparkline (with label on sm+) */}
              <div className="flex flex-col gap-1 min-w-0">
                <span
                  className="hidden sm:block text-[12px] font-medium truncate"
                  style={{ color: 'var(--am-text)' }}
                >
                  {dim.dimension}
                </span>
                <Sparkline trend={dim.trend} />
              </div>

              {/* Current score */}
              <span
                className="text-[13px] font-mono font-semibold text-right"
                style={{ color: scoreColor(dim.currentScore) }}
              >
                {dim.currentScore}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="mt-3 text-[10px]" style={{ color: 'var(--am-amber)' }}>
        † all values from mock-data.ts · green ≥ 75 · amber ≥ 60 · red &lt; 60 · no real calculation
      </p>
    </div>
  )
}
