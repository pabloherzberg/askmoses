import type { CorrelationFactor, CorrelationLevel, CorrelationSource } from '@/lib/types'

const barColor: Record<CorrelationLevel, string> = {
  High: 'var(--am-green)',
  Med:  'var(--am-amber)',
  Low:  'var(--am-muted)',
}

const levelStyle: Record<CorrelationLevel, { color: string; bg: string }> = {
  High: { color: 'var(--am-green)',  bg: 'rgba(34,217,160,0.12)' },
  Med:  { color: 'var(--am-amber)',  bg: 'rgba(255,171,46,0.12)' },
  Low:  { color: 'var(--am-muted)',  bg: 'rgba(122,132,154,0.12)' },
}

const sourceStyle: Record<CorrelationSource, { color: string; bg: string }> = {
  Rubric:     { color: 'var(--am-accent2)', bg: 'rgba(155,135,255,0.12)' },
  Behavioral: { color: 'var(--am-green)',   bg: 'rgba(34,217,160,0.12)' },
}

function LevelBadge({ value }: { value: CorrelationLevel }) {
  const s = levelStyle[value]
  return (
    <span
      className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}
    >
      {value}
    </span>
  )
}

function SourceBadge({ value }: { value: CorrelationSource }) {
  const s = sourceStyle[value]
  return (
    <span
      className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}
    >
      {value}
    </span>
  )
}

interface Props {
  factors: CorrelationFactor[]
}

export function CorrelationEngine({ factors }: Props) {
  return (
    <div
      className="rounded-2xl p-5 border shadow-md"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Correlation Engine — What Drives Closes
        </p>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
          style={{ color: 'var(--am-amber)', borderColor: 'rgba(255,171,46,0.35)', background: 'rgba(255,171,46,0.08)' }}
        >
          mock data only
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {(['High', 'Med', 'Low'] as CorrelationLevel[]).map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0"
              style={{ background: barColor[level] }}
            />
            <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
              {level} correlation
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: 'var(--am-accent2)' }} />
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>Rubric</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: 'var(--am-green)' }} />
          <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>Behavioral</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid items-center mb-2 gap-2" style={{ gridTemplateColumns: '1fr 3fr 3rem 4rem 4rem 5rem' }}>
        {['Factor', 'Score', '%', 'Corr.', 'Impact', 'Source'].map((h) => (
          <span key={h} className="text-[10px] font-medium" style={{ color: 'var(--am-muted)' }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {factors.map((f, i) => (
          <div
            key={f.label}
            className="grid items-center gap-2 py-2"
            style={{
              gridTemplateColumns: '1fr 3fr 3rem 4rem 4rem 5rem',
              borderTop: i > 0 ? '1px solid var(--am-border)' : 'none',
            }}
          >
            {/* Factor name */}
            <span className="text-[12px] font-medium truncate" style={{ color: 'var(--am-text)' }}>
              {f.label}
            </span>

            {/* Bar */}
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: 'var(--am-bg4)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${f.score}%`,
                  background: barColor[f.correlation],
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            {/* Score % */}
            <span className="text-[12px] font-mono text-right" style={{ color: 'var(--am-text)' }}>
              {f.score}%
            </span>

            {/* Correlation badge */}
            <div className="flex justify-center">
              <LevelBadge value={f.correlation} />
            </div>

            {/* Impact badge */}
            <div className="flex justify-center">
              <LevelBadge value={f.impact} />
            </div>

            {/* Source badge */}
            <div className="flex justify-center">
              <SourceBadge value={f.source} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-[10px]" style={{ color: 'var(--am-red)' }}>
        † all values sourced from mock-data.ts — no real calculation on the frontend
      </p>
    </div>
  )
}
