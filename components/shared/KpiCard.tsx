import { Sparkline } from './Sparkline'

interface KpiCardProps {
  label: string
  value: string | number
  valueColor?: string
  /** Linha pequena abaixo do valor — usada para contexto histórico ("of 47 total"). */
  sublabel?: string
  /** Mudança vs período anterior (ex: +0.3, -2). Sem texto, só o número formatado. */
  delta?: number
  /** Sufixo do delta (ex: '%', 'pp'). */
  deltaSuffix?: string
  /** Texto curto ao lado do delta (ex: "vs prev"). */
  deltaLabel?: string
  sparkData?: number[]
  sparkColor?: string
  /** Domínio Y do sparkline. */
  sparkDomain?: [number, number]
}

export function KpiCard({
  label,
  value,
  valueColor,
  sublabel,
  delta,
  deltaSuffix = '',
  deltaLabel,
  sparkData,
  sparkColor,
  sparkDomain,
}: KpiCardProps) {
  const hasDelta = delta !== undefined && Number.isFinite(delta) && delta !== 0
  const isPositive = hasDelta && (delta as number) > 0
  const deltaColor = !hasDelta
    ? 'var(--am-muted)'
    : isPositive
      ? 'var(--am-green)'
      : 'var(--am-red)'

  const sparkStroke = sparkColor ?? valueColor ?? 'var(--am-accent)'

  return (
    <div
      className="rounded-xl border shadow-md am-fade-up flex flex-col"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--am-border)',
        padding: '14px 16px 10px',
      }}
    >
      {/* Header row: label + delta pill */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-[11px] uppercase tracking-wide font-medium truncate"
          style={{ color: 'var(--am-muted)' }}
        >
          {label}
        </span>
        {hasDelta && (
          <span
            className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color: deltaColor,
              background: `color-mix(in srgb, ${deltaColor} 12%, transparent)`,
            }}
          >
            <span className="font-mono">
              {isPositive ? '↑' : '↓'} {Math.abs(delta as number)}{deltaSuffix}
            </span>
            {deltaLabel && (
              <span className="opacity-70 font-sans">{deltaLabel}</span>
            )}
          </span>
        )}
      </div>

      {/* Value */}
      <div
        className="text-[26px] font-semibold tracking-tight leading-none"
        style={{ color: valueColor ?? 'var(--am-text)' }}
      >
        {value}
      </div>

      {/* Sublabel (contexto histórico) */}
      {sublabel ? (
        <div className="text-[10px] mt-1" style={{ color: 'var(--am-muted)' }}>
          {sublabel}
        </div>
      ) : (
        <div style={{ height: 14 }} />
      )}

      {/* Sparkline */}
      <div className="mt-auto pt-1 -mx-1">
        {sparkData && sparkData.length >= 2 ? (
          <Sparkline data={sparkData} color={sparkStroke} domain={sparkDomain} height={26} />
        ) : (
          <div style={{ height: 26 }} />
        )}
      </div>
    </div>
  )
}
