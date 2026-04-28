import type { BehavioralTrendDimension } from '@/lib/mock-data'

function barColor(score: number) {
  if (score >= 75) return 'var(--am-green)'
  if (score >= 60) return 'var(--am-amber)'
  return 'var(--am-red)'
}

function BarSparkline({ trend }: { trend: number[] }) {
  const max = Math.max(...trend) + 4
  const min = Math.min(...trend) - 4
  const range = max - min || 1
  const barWidth = 8
  const gap = 3
  const H = 28

  return (
    <svg
      width={trend.length * (barWidth + gap) - gap}
      height={H}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {trend.map((v, i) => {
        const barH = Math.max(2, ((v - min) / range) * H)
        const color = barColor(v)
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={H - barH}
            width={barWidth}
            height={barH}
            rx={2}
            fill={color}
            opacity={i === trend.length - 1 ? 1 : 0.45 + (i / trend.length) * 0.4}
          />
        )
      })}
    </svg>
  )
}

interface Props {
  dimensions: BehavioralTrendDimension[]
}

export function BehavioralTrends({ dimensions }: Props) {
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

      {/* Rows */}
      <div className="flex flex-col">
        {dimensions.map((dim, i) => (
          <div
            key={dim.dimension}
            className="flex items-center justify-between gap-3 py-2.5"
            style={{ borderTop: i > 0 ? '1px solid var(--am-border)' : 'none' }}
          >
            {/* Dimension name */}
            <span
              className="text-[12px] font-medium w-36 flex-shrink-0 truncate"
              style={{ color: 'var(--am-text)' }}
            >
              {dim.dimension}
            </span>

            {/* Bar sparkline */}
            <div className="flex-1 flex justify-center">
              <BarSparkline trend={dim.trend} />
            </div>

            {/* Current score */}
            <span
              className="text-[13px] font-mono font-semibold w-8 text-right flex-shrink-0"
              style={{ color: barColor(dim.currentScore) }}
            >
              {dim.currentScore}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p className="mt-3 text-[10px]" style={{ color: 'var(--am-amber)' }}>
        † mock data · green ≥ 75 · amber ≥ 60 · red &lt; 60
      </p>
    </div>
  )
}
