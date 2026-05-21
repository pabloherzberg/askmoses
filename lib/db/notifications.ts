import { createAdminClient } from '@/lib/supabase/admin'

// Notificações de coaching (migration 057). Owner envia recomendação →
// sales person lê no sino do header. Acesso só via service role.

export type NotificationStatus = 'unread' | 'read'

export interface DbCoachingNotification {
  id: string
  org_id: string
  recipient_trainer_id: string | null
  recipient_name: string
  sent_by: string | null
  sent_by_name: string
  title: string
  body: string
  status: NotificationStatus
  created_at: string
  read_at: string | null
}

export interface CreateCoachingNotificationInput {
  orgId: string
  recipientTrainerId: string | null
  recipientName: string
  sentBy: string | null
  sentByName: string
  title: string
  body: string
}

export interface ResolvedTrainer {
  id: string
  name: string
  /** Email do trainer (users.email) — null se não resolver. */
  email: string | null
}

/**
 * Resolve o trainer destinatário pelo ID, validando que pertence à org do
 * Owner. Nome e email vêm do join com `users` — não dependem de o trainer já
 * ter calls (ao contrário da antiga resolução por calls.trainer_name, que
 * falhava pra um trainer recém-criado sem calls). Retorna null se o ID não
 * casar com nenhum trainer da org.
 */
export async function dbResolveTrainerById(
  orgId: string,
  trainerId: string,
): Promise<ResolvedTrainer | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('trainers')
    .select('id, org_id, users(name, email)')
    .eq('id', trainerId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`dbResolveTrainerById: ${error.message}`)
  if (!data) return null
  const user = (data.users ?? null) as { name?: string | null; email?: string | null } | null
  return {
    id: data.id as string,
    name: user?.name ?? '',
    email: user?.email ?? null,
  }
}

export async function dbCreateCoachingNotification(
  input: CreateCoachingNotificationInput,
): Promise<DbCoachingNotification> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('coaching_notifications')
    .insert({
      org_id: input.orgId,
      recipient_trainer_id: input.recipientTrainerId,
      recipient_name: input.recipientName,
      sent_by: input.sentBy,
      sent_by_name: input.sentByName,
      title: input.title,
      body: input.body,
    })
    .select()
    .single()
  if (error) throw new Error(`dbCreateCoachingNotification: ${error.message}`)
  return data as DbCoachingNotification
}

export async function dbGetTrainerNotifications(
  trainerId: string,
): Promise<DbCoachingNotification[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('coaching_notifications')
    .select('*')
    .eq('recipient_trainer_id', trainerId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(`dbGetTrainerNotifications: ${error.message}`)
  return (data ?? []) as DbCoachingNotification[]
}

export async function dbMarkTrainerNotificationsRead(trainerId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('coaching_notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('recipient_trainer_id', trainerId)
    .eq('status', 'unread')
  if (error) throw new Error(`dbMarkTrainerNotificationsRead: ${error.message}`)
}

// ─── Preferências de canal (migration 058) ─────────────────────────────────
// O trainer escolhe em /me/settings quais canais mantém ativos. O envio de
// uma recomendação (POST /api/coaching/notifications) faz fan-out só pros
// canais ativos do destinatário.

export interface ChannelPrefs {
  inApp: boolean
  email: boolean
}

// Sem linha (nunca configurou) = ambos os canais ativos. Mantém o
// comportamento anterior à migration 058 pra quem nunca abriu /me/settings.
const DEFAULT_CHANNEL_PREFS: ChannelPrefs = { inApp: true, email: true }

/**
 * Lê as preferências de canal do trainer. Degrada com segurança: sem linha
 * OU erro de query (ex.: migration 058 ainda não aplicada) → defaults com
 * ambos os canais ativos, preservando o fluxo de notificação anterior.
 */
export async function dbGetChannelPrefs(trainerId: string): Promise<ChannelPrefs> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('coaching_channel_prefs')
      .select('in_app, email')
      .eq('trainer_id', trainerId)
      .maybeSingle()
    if (error || !data) return DEFAULT_CHANNEL_PREFS
    return { inApp: Boolean(data.in_app), email: Boolean(data.email) }
  } catch {
    return DEFAULT_CHANNEL_PREFS
  }
}

/** Cria/atualiza as preferências de canal do trainer (upsert por trainer_id). */
export async function dbUpsertChannelPrefs(
  trainerId: string,
  prefs: ChannelPrefs,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('coaching_channel_prefs')
    .upsert(
      {
        trainer_id: trainerId,
        in_app: prefs.inApp,
        email: prefs.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trainer_id' },
    )
  if (error) throw new Error(`dbUpsertChannelPrefs: ${error.message}`)
}
