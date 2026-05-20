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

/**
 * Resolve o trainer destinatário pelo nome, dentro da org. Usa
 * calls.trainer_name como fonte — é o campo consistente com os nomes da
 * tela de coaching em ambas as variantes de seed. Retorna null se nenhuma
 * call casar (a notificação ainda é gravada, só não vira "entregável").
 */
export async function dbResolveTrainerIdByName(
  orgId: string,
  name: string,
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('calls')
    .select('trainer_id')
    .eq('org_id', orgId)
    .eq('trainer_name', name)
    .not('trainer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`dbResolveTrainerIdByName: ${error.message}`)
  return (data?.trainer_id as string | undefined) ?? null
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
