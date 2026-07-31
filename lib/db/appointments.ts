import { createAdminClient } from '@/lib/supabase/admin'

export interface DbAppointment {
  id: string
  org_id: string
  ghl_appointment_id: string
  contact_id: string | null
  contact_name: string | null
  trainer_id: string | null
  trainer_name: string | null
  scheduled_at: string
  status: string | null
  ghl_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface UpsertAppointmentInput {
  orgId: string
  ghlAppointmentId: string
  contactId?: string | null
  contactName?: string | null
  trainerId?: string | null
  trainerName?: string | null
  scheduledAt: string // ISO 8601
  status?: string | null
  ghlPayload?: Record<string, unknown> | null
}

// Upsert idempotente por (org_id, ghl_appointment_id) — reenvio do mesmo
// agendamento atualiza a linha em vez de duplicar (UNIQUE INDEX migration 094).
export async function dbUpsertGhlAppointment(
  input: UpsertAppointmentInput,
): Promise<DbAppointment> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .upsert(
      {
        org_id: input.orgId,
        ghl_appointment_id: input.ghlAppointmentId,
        contact_id: input.contactId ?? null,
        contact_name: input.contactName ?? null,
        trainer_id: input.trainerId ?? null,
        trainer_name: input.trainerName ?? null,
        scheduled_at: input.scheduledAt,
        status: input.status ?? null,
        ghl_payload: input.ghlPayload ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,ghl_appointment_id' },
    )
    .select('*')
    .single()

  if (error) throw new Error(`dbUpsertGhlAppointment: ${error.message}`)
  return data as DbAppointment
}

// Agendamentos da org para um conjunto de contatos (chunked — a lista de
// contactIds vem das calls exibidas e pode passar de 200). Ordenados por
// horário asc; quem escolhe QUAL agendamento casa com cada call é o serviço.
const CONTACTS_CHUNK = 100

export async function dbGetAppointmentsByContacts(
  orgId: string,
  contactIds: string[],
): Promise<DbAppointment[]> {
  if (contactIds.length === 0) return []
  const supabase = createAdminClient()

  const rows: DbAppointment[] = []
  for (let i = 0; i < contactIds.length; i += CONTACTS_CHUNK) {
    const chunk = contactIds.slice(i, i + CONTACTS_CHUNK)
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('org_id', orgId)
      .in('contact_id', chunk)
      .order('scheduled_at', { ascending: true })

    if (error) throw new Error(`dbGetAppointmentsByContacts: ${error.message}`)
    rows.push(...((data ?? []) as DbAppointment[]))
  }
  return rows
}

// Agendamentos de HOJE para a org (janela [início, fim] do dia no servidor),
// ordenados por horário. Alimenta a visão "agendados hoje" do owner.
export async function dbGetTodayAppointments(orgId: string): Promise<DbAppointment[]> {
  const supabase = createAdminClient()

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('org_id', orgId)
    .gte('scheduled_at', start.toISOString())
    .lte('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(`dbGetTodayAppointments: ${error.message}`)
  return (data ?? []) as DbAppointment[]
}

// Agendamentos do MESMO contato criados a partir da call (janela
// [call.created_at, +N dias]) — sinal para o scoring saber se a call gerou um
// agendamento futuro, mesmo sem venda fechada na hora. Usado por
// runGhlCallScoring (lib/services/ghl-call-scoring.ts) para enriquecer o
// prompt; NÃO decide outcome sozinho (ver buildDefaultSystemPrompt).
export async function dbGetAppointmentsForContactSince(
  orgId: string,
  contactId: string,
  since: string,
): Promise<DbAppointment[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .gte('scheduled_at', since)
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(`dbGetAppointmentsForContactSince: ${error.message}`)
  return (data ?? []) as DbAppointment[]
}
