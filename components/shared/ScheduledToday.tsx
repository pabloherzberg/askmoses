'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { intentIndexToDisplay } from '@/lib/utils/intentScore'

interface TodayAppointment {
  id: string
  contactId: string | null
  contactName: string | null
  trainerName: string | null
  scheduledAt: string
  status: string | null
  intent: number | null
}

// Cor do intent 0–5 (mesma lógica de faixa do ScorePill: alto verde, médio
// âmbar, baixo vermelho). Aplicado ao número de intent de cada agendado.
function intentColor(intent: number | null): string {
  if (intent == null) return 'var(--am-muted)'
  if (intent >= 4) return 'var(--am-green)'
  if (intent >= 2.5) return 'var(--am-amber)'
  return 'var(--am-red)'
}

// Visão do owner: quem está agendado pra HOJE + intent de cada lead, ordenado
// por intent desc ("fecha esse aqui"). Dados vêm da agenda GHL (appointments)
// juntada ao último intent conhecido do contato.
export function ScheduledToday() {
  const locale = useLocale()
  const [items, setItems] = useState<TodayAppointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/appointments/today')
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data?.appointments)) {
          setItems(json.data.appointments)
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  // Sem agendamentos hoje (ou GHL não plugado) → não polui a página.
  if (!loading && items.length === 0) return null

  return (
    <div
      className="rounded-2xl p-5 border shadow-md mb-6"
      style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
    >
      <div className="mb-4">
        <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
          Scheduled Today
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
          Who&apos;s booked today and how hot each lead is — focus the team on the ones that can&apos;t cool off.
        </p>
      </div>

      {loading ? (
        <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
          Loading…
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((appt) => {
            const time = new Date(appt.scheduledAt).toLocaleTimeString(locale, {
              hour: '2-digit',
              minute: '2-digit',
            })
            const inner = (
              <div
                className="flex items-center justify-between p-3 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: 'var(--am-bg3)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium" style={{ color: 'var(--am-text)' }}>
                    {appt.contactName ?? 'Unknown lead'}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                    {time}
                    {appt.trainerName && <> · {appt.trainerName}</>}
                    {appt.status && <> · {appt.status}</>}
                  </p>
                </div>
                <span
                  className="text-lg font-bold font-mono ml-3"
                  style={{ color: intentColor(appt.intent) }}
                >
                  {appt.intent != null ? intentIndexToDisplay(appt.intent) : '—'}
                </span>
              </div>
            )
            // Link pro detalhe da call do contato não é trivial (appointment não
            // tem callId direto), então mantemos o card estático por ora.
            return <div key={appt.id}>{inner}</div>
          })}
        </div>
      )}
    </div>
  )
}
