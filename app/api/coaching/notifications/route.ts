import { type NextRequest } from 'next/server'
import {
  getActiveOrgContext,
  getSession,
  getTrainerDbId,
  ok,
  unauthorized,
  forbidden,
  requireOwnerWrite,
} from '@/lib/auth'
import {
  dbCreateCoachingNotification,
  dbGetChannelPrefs,
  dbGetTrainerNotifications,
  dbMarkTrainerNotificationsRead,
  dbResolveTrainerById,
} from '@/lib/db/notifications'
import { sendCoachingRecEmail } from '@/lib/email/send-coaching-rec'

function badRequest(message: string, reason?: string) {
  return Response.json({ data: null, error: { message, code: 400, reason } }, { status: 400 })
}

function notFound(message: string, reason?: string) {
  return Response.json({ data: null, error: { message, code: 404, reason } }, { status: 404 })
}

function serverError(message: string, reason = 'INTERNAL_ERROR') {
  return Response.json({ data: null, error: { message, code: 500, reason } }, { status: 500 })
}

// ── GET — sales person lista as próprias notificações (sino do header) ──────
// Owners/admins recebem isRecipient:false e lista vazia (não recebem coaching).
// Trainer com o canal in-app DESLIGADO em /me/settings também recebe
// isRecipient:false → o sino some por completo do header.
export async function GET() {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()
    if (ctx.role !== 'trainer') {
      return ok({ isRecipient: false, items: [], unreadCount: 0 })
    }
    const trainerId = await getTrainerDbId()
    if (!trainerId) return ok({ isRecipient: false, items: [], unreadCount: 0 })

    // Canal in-app desligado → trainer optou por não receber no sino.
    const prefs = await dbGetChannelPrefs(trainerId)
    if (!prefs.inApp) {
      return ok({ isRecipient: false, items: [], unreadCount: 0 })
    }

    const rows = await dbGetTrainerNotifications(trainerId)
    const items = rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      sentByName: n.sent_by_name,
      status: n.status,
      createdAt: n.created_at,
    }))
    const unreadCount = items.filter((i) => i.status === 'unread').length
    return ok({ isRecipient: true, items, unreadCount })
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Erro ao carregar notificações')
  }
}

// ── POST — Owner envia uma recomendação de coaching pra um sales person ─────
// O destinatário é identificado pelo ID do trainer (recipientId) — direto e
// confiável, não depende de o trainer já ter calls (ao contrário da resolução
// por nome). A recomendação é sempre gravada e a entrega faz fan-out pros
// canais ativos do trainer:
//   in-app → fica visível no sino (gateado por prefs.inApp no GET)
//   email  → dispara o email de recomendação (Resend, com fallback mock)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()

    const blocked = await requireOwnerWrite()
    if (blocked) return blocked

    const isEffectiveOwner = ctx.role === 'owner' || (ctx.role === 'admin' && ctx.isImpersonating)
    if (!isEffectiveOwner || !ctx.activeOrgId) return forbidden()

    let body: { recipientId?: unknown; title?: unknown; body?: unknown }
    try {
      body = await request.json()
    } catch {
      return badRequest('JSON inválido', 'INVALID_JSON')
    }

    const recipientId = typeof body.recipientId === 'string' ? body.recipientId.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!recipientId || !title || !text) {
      return badRequest('recipientId, title e body são obrigatórios', 'MISSING_FIELDS')
    }

    // Resolve por ID + valida que o trainer pertence à org do Owner.
    const trainer = await dbResolveTrainerById(ctx.activeOrgId, recipientId)
    if (!trainer) return notFound('Trainer não encontrado nesta organização', 'TRAINER_NOT_FOUND')

    // Canais ativos do destinatário (in-app / email).
    const prefs = await dbGetChannelPrefs(trainer.id)

    // Nome de quem enviou — best-effort a partir do metadata da sessão.
    const session = await getSession()
    const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
    const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
    const metaName = typeof meta.name === 'string' ? meta.name.trim() : ''
    const sentByName = fullName || metaName || session?.user.email || 'Owner'

    // A notificação é sempre gravada — é o registro canônico da recomendação.
    // A visibilidade no sino é decidida no GET por prefs.inApp.
    const notification = await dbCreateCoachingNotification({
      orgId: ctx.activeOrgId,
      recipientTrainerId: trainer.id,
      recipientName: trainer.name || 'Trainer',
      sentBy: ctx.userId,
      sentByName,
      title,
      body: text,
    })

    // Fan-out por email — só se o canal estiver ativo E houver endereço.
    let emailDelivery: 'sent' | 'mocked' | 'skipped' | 'failed' = 'skipped'
    if (prefs.email && trainer.email) {
      const locale = request.headers.get('x-locale') ?? undefined
      const result = await sendCoachingRecEmail({
        to: trainer.email,
        trainerName: trainer.name || 'Trainer',
        senderName: sentByName,
        body: text,
        locale,
      })
      emailDelivery = result.delivery
    }

    return ok({
      id: notification.id,
      status: notification.status,
      delivery: { inApp: prefs.inApp, email: emailDelivery },
    })
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Erro ao enviar notificação')
  }
}

// ── PATCH — sales person marca todas as próprias notificações como lidas ────
export async function PATCH() {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()
    if (ctx.role !== 'trainer') return forbidden()
    const trainerId = await getTrainerDbId()
    if (!trainerId) return forbidden()

    await dbMarkTrainerNotificationsRead(trainerId)
    return ok({ success: true })
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Erro ao atualizar notificações')
  }
}
