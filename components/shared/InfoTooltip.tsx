'use client'

interface InfoTooltipProps {
  text: string
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="relative inline-flex items-center group">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-default select-none"
        style={{
          color: 'var(--am-accent2)',
          background: 'rgba(110,86,255,0.15)',
          border: '1px solid rgba(110,86,255,0.30)',
        }}
      >
        i
      </span>
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-normal"
        style={{
          background: 'var(--am-bg3)',
          border: '1px solid var(--am-border)',
          color: 'var(--am-muted)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <span
          className="block mb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--am-accent2)' }}
        >
          O que mudou
        </span>
        {text}
        {/* arrow */}
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
          style={{ borderTopColor: 'var(--am-border)' }}
        />
      </span>
    </span>
  )
}
