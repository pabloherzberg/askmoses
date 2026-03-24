import { cn } from '@/lib/utils'
import type { AvatarColor } from '@/lib/types'

const colorMap: Record<AvatarColor, { bg: string; text: string }> = {
  blue:   { bg: 'rgba(94,179,255,0.15)',  text: 'var(--am-blue)' },
  purple: { bg: 'rgba(110,86,255,0.2)',   text: 'var(--am-accent2)' },
  green:  { bg: 'rgba(34,217,160,0.15)',  text: 'var(--am-green)' },
  red:    { bg: 'rgba(255,94,94,0.15)',   text: 'var(--am-red)' },
}

const sizeMap = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-[38px] h-[38px] text-[12px]',
  lg: 'w-12 h-12 text-sm',
}

interface TrainerAvatarProps {
  initials: string
  color: AvatarColor
  size?: keyof typeof sizeMap
  className?: string
}

export function TrainerAvatar({ initials, color, size = 'md', className }: TrainerAvatarProps) {
  const { bg, text } = colorMap[color]
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold flex-shrink-0 font-mono',
        sizeMap[size],
        className
      )}
      style={{ background: bg, color: text }}
    >
      {initials}
    </div>
  )
}
