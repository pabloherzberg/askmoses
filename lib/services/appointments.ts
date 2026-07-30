import { createAdminClient } from '@/lib/supabase/admin'
import { applySalesCallOnly } from '@/lib/sales-calls'
import { dbGetTodayAppointments, dbGetAppointmentsByContacts } from '@/lib/db/appointments'
import { readStoredIntent } from '@/lib/services/calls'
import type { Call, CallResult } from '@/lib/types'

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

// Enriquece calls com o agendamento do lead (coluna "Appointment" do Intent
// Analysis). Junta por contactId — a MESMA chave que o fluxo do "Won" usa pra
// casar opportunity → calls, então uma call sem contact_id (upload manual, ou
// call GHL anterior ao backfill 102/103) fica sem appointment, exatamente como
// fica sem ghl_won_status.
//
// Qual agendamento casa com a call: o primeiro agendado NO DIA da call ou
// depois — é o agendamento que a call produziu, que é o que o owner quer ver.
// Sem nenhum posterior, cai pro mais recente anterior (o agendamento que gerou
// a call), marcado só pela data — a UI não distingue os dois casos.
//
// Calls sem contactId ganham `appointmentAt: null` (consultado, não há), nunca
// undefined — a UI usa a diferença pra não confundir "não enriquecido" com
// "sem agendamento".
export async function attachAppointmentsToCalls(
  orgId: string,
  calls: Call[],
): Promise<Call[]> {
  const contactIds = Array.from(
    new Set(calls.map((c) => c.contactId).filter((c): c is string => !!c)),
  )
  if (contactIds.length === 0) {
    return calls.map((c) => ({ ...c, appointmentAt: null, appointmentStatus: null }))
  }

  const rows = await dbGetAppointmentsByContacts(orgId, contactIds)

  // contactId → agendamentos ordenados por horário asc (a query já ordena,
  // mas o chunking quebra a ordem global — reordena por contato).
  const byContact = new Map<string, { at: number; iso: string; status: string | null }[]>()
  for (const row of rows) {
    if (!row.contact_id) continue
    const at = new Date(row.scheduled_at).getTime()
    if (Number.isNaN(at)) continue
    const list = byContact.get(row.contact_id) ?? []
    list.push({ at, iso: row.scheduled_at, status: row.status })
    byContact.set(row.contact_id, list)
  }
  for (const list of byContact.values()) list.sort((a, b) => a.at - b.at)

  return calls.map((call) => {
    const list = call.contactId ? byContact.get(call.contactId) : undefined
    if (!list || list.length === 0) {
      return { ...call, appointmentAt: null, appointmentStatus: null }
    }
    // Âncora: início do dia da call (UTC). callDate é a data real; date
    // (created_at) é o fallback pra calls sem call_date.
    const rawAnchor = call.callDate ?? call.date
    const anchorMs = rawAnchor ? new Date(rawAnchor).getTime() : Number.NaN
    let picked = list[list.length - 1]
    if (!Number.isNaN(anchorMs)) {
      const anchor = new Date(anchorMs)
      const dayStart = Date.UTC(
        anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 0, 0, 0, 0,
      )
      picked = list.find((a) => a.at >= dayStart) ?? list[list.length - 1]
    }
    return { ...call, appointmentAt: picked.iso, appointmentStatus: picked.status }
  })
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
    // salesOnly: o intent do lead vem da call de venda mais recente do contato.
    // Sem o filtro, uma call não-venda (intent NULL) mais recente mascararia o
    // intent real de uma call de venda anterior.
    const { data } = await applySalesCallOnly(
      admin
        .from('calls')
        .select('contact_id, intent, call_outcome, created_at')
        .eq('org_id', orgId)
        .in('contact_id', contactIds),
    ).order('created_at', { ascending: false })

    for (const row of (data ?? []) as Array<{
      contact_id: string | null
      intent: number | null
      call_outcome: string | null
    }>) {
      if (!row.contact_id || intentByContact.has(row.contact_id)) continue
      const result = (row.call_outcome ?? 'not_closed') as CallResult
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
