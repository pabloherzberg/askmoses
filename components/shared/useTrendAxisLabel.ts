'use client'

import { useFormatter, useTranslations } from 'next-intl'

// Parse de "YYYY-MM-DD" como data LOCAL. `new Date('2026-08-11')` é lido pelo
// JS como meia-noite UTC — em UTC-3 isso vira 10/08 21:00 e o eixo mostraria a
// semana anterior. Montando componente a componente a data nasce local e o
// Intl formata o dia certo.
function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Formata o label do eixo X dos gráficos de tendência.
 *
 * Ordem de preferência:
 *   1) `weekStart` presente → range real da semana ("11–17 de ago."), montado
 *      pelo `dateTimeRange` do next-intl (Intl.DateTimeFormat.formatRange), que
 *      já resolve separador, ordem de dia/mês e abreviação por locale.
 *   2) "W{n}" sem weekStart → "Semana {n}" (dados legados/mock).
 *   3) "C{n}" → "Call {n}" (modo per-call esparso, buildPerCallTrend).
 */
export function useTrendAxisLabel() {
  const t = useTranslations('Shared.trendAxis')
  const format = useFormatter()

  return (week: string, weekStart?: string) => {
    const start = weekStart ? parseDateKey(weekStart) : null
    if (start) {
      // A semana fecha no domingo (start + 6). Usar a segunda seguinte
      // renderizaria "11–18", sugerindo 8 dias.
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return format.dateTimeRange(start, end, {
        day: 'numeric',
        month: 'short',
      })
    }

    if (week.startsWith('W')) {
      const n = parseInt(week.slice(1), 10)
      return Number.isNaN(n) ? week : t('weekLabel', { n })
    }
    if (week.startsWith('C')) {
      const n = parseInt(week.slice(1), 10)
      return Number.isNaN(n) ? week : t('callLabel', { n })
    }
    return week
  }
}
