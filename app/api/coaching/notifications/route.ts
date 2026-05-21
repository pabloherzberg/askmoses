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
  dbResolveTrainerByName,
} from '@/lib/db/notifications'
import { sendCoachingRecEmail } from '@/lib/email/send-coaching-rec'

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(message: string) {
  return Response.json({ data: null, error: { message, code: 500 } }, { status: 500 })
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
// A recomendação é sempre gravada (registro canônico) e a entrega faz fan-out
// pros canais ativos do trainer destinatário:
//   in-app → fica visível no sino (gateado por prefs.inApp no GET)
//   email  → dispara o email de recomendação (Resend, com fallback mock)
export async function POST(request: NextRequest) {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()

    // Admin impersonando é read-only dentro de orgs — bloqueia escrita.
    const blocked = await requireOwnerWrite()
    if (blocked) return blocked

    if (ctx.role !== 'owner' || !ctx.activeOrgId) return forbidden()

    let body: { recipientName?: unknown; title?: unknown; body?: unknown }
    try {
      body = await request.json()
    } catch {
      return badRequest('JSON inválido')
    }

    const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!recipientName || !title || !text) {
      return badRequest('recipientName, title e body são obrigatórios')
    }

    const trainer = await dbResolveTrainerByName(ctx.activeOrgId, recipientName)

    // Canais ativos do destinatário. Trainer não-resolvido → defaults (ambos),
    // mas sem email a entrega por email é pulada de qualquer forma.
    const prefs = trainer
      ? await dbGetChannelPrefs(trainer.id)
      : { inApp: true, email: true }

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
      recipientTrainerId: trainer?.id ?? null,
      recipientName,
      sentBy: ctx.userId,
      sentByName,
      title,
      body: text,
    })

    // Fan-out por email — só se o canal estiver ativo E houver endereço.
    let emailDelivery: 'sent' | 'mocked' | 'skipped' | 'failed' = 'skipped'
    if (prefs.email && trainer?.email) {
      const locale = request.headers.get('x-locale') ?? undefined
      const result = await sendCoachingRecEmail({
        to: trainer.email,
        trainerName: recipientName,
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
