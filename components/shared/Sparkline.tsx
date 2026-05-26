interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  /** Domínio Y. Default: min/max exatos dos dados. */
  domain?: [number, number]
  /** Mostra a área embaixo do trace. */
  fill?: boolean
  className?: string
}

export function Sparkline({
  data,
  color = 'var(--am-accent)',
  height = 28,
  domain,
  fill = true,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <div style={{ height }} className={className} />
  }

  const min = domain ? domain[0] : Math.min(...data)
  const max = domain ? domain[1] : Math.max(...data)
  const span = max - min || 1

  const width = 100
  const stepX = width / (data.length - 1)

  const points = data
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / span) * height
      return `${x},${y}`
    })
    .join(' ')

  const areaPath = fill
    ? `M0,${height} L${data
        .map((v, i) => {
          const x = i * stepX
          const y = height - ((v - min) / span) * height
          return `${x},${y}`
        })
        .join(' L')} L${width},${height} Z`
    : ''

  const gradientId = `spark-gradient-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
