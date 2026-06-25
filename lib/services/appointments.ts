import { createAdminClient } from '@/lib/supabase/admin'
import { dbGetTodayAppointments } from '@/lib/db/appointments'
import { readStoredIntent } from '@/lib/services/calls'
import type { CallResult } from '@/lib/types'

export interface TodayAppointment {
  id: string
  contactId: string | null
  contactName: string | null
  trainerName: string | null
  scheduledAt: string
  status: string | null
  // Último intent conhecido do lead (0–5) — junta appointment → calls via contactId.
  intent: number | null
}

// Agendados hoje + o intent de cada lead. O owner usa pra mandar o time focar
// em quem não pode esfriar ("fecha esse aqui"). O intent vem da call mais
// recente do mesmo contato (calls.contact_id, migration 091).
export async function getTodayAppointmentsWithIntent(orgId: string): Promise<TodayAppointment[]> {
  const appointments = await dbGetTodayAppointments(orgId)
  if (appointments.length === 0) return []

  const contactIds = Array.from(
    new Set(appointments.map((a) => a.contact_id).filter((c): c is string => !!c)),
  )

  // Mapa contactId → último intent (call mais recente do contato na org).
  const intentByContact = new Map<string, number | null>()
  if (contactIds.length > 0) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('calls')
      .select('contact_id, intent, call_outcome, created_at')
      .eq('org_id', orgId)
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false })

    for (const row of (data ?? []) as Array<{
      contact_id: string | null
      intent: number | null
      call_outcome: string | null
    }>) {
      if (!row.contact_id || intentByContact.has(row.contact_id)) continue
      const result = (row.call_outcome ?? 'no_outcome') as CallResult
      intentByContact.set(row.contact_id, readStoredIntent(row.intent, result))
    }
  }

  return appointments
    .map((a) => ({
      id: a.id,
      contactId: a.contact_id,
      contactName: a.contact_name,
      trainerName: a.trainer_name,
      scheduledAt: a.scheduled_at,
      status: a.status,
      intent: a.contact_id ? (intentByContact.get(a.contact_id) ?? null) : null,
    }))
    // Ordena por intent desc (quem está mais quente primeiro), depois por horário.
    .sort((x, y) => {
      const ix = x.intent ?? -1
      const iy = y.intent ?? -1
      if (iy !== ix) return iy - ix
      return new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime()
    })
}
