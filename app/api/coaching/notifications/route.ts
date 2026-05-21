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
  dbGetTrainerNotifications,
  dbMarkTrainerNotificationsRead,
  dbResolveTrainerIdByName,
} from '@/lib/db/notifications'

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(message: string) {
  return Response.json({ data: null, error: { message, code: 500 } }, { status: 500 })
}

// ── GET — sales person lista as próprias notificações (sino do header) ──────
// Owners/admins recebem isRecipient:false e lista vazia (não recebem coaching).
export async function GET() {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()
    if (ctx.role !== 'trainer') {
      return ok({ isRecipient: false, items: [], unreadCount: 0 })
    }
    const trainerId = await getTrainerDbId()
    if (!trainerId) return ok({ isRecipient: false, items: [], unreadCount: 0 })

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

    const recipientTrainerId = await dbResolveTrainerIdByName(ctx.activeOrgId, recipientName)

    // Nome de quem enviou — best-effort a partir do metadata da sessão.
    const session = await getSession()
    const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
    const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
    const metaName = typeof meta.name === 'string' ? meta.name.trim() : ''
    const sentByName = fullName || metaName || session?.user.email || 'Owner'

    const notification = await dbCreateCoachingNotification({
      orgId: ctx.activeOrgId,
      recipientTrainerId,
      recipientName,
      sentBy: ctx.userId,
      sentByName,
      title,
      body: text,
    })

    return ok({ id: notification.id, status: notification.status })
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
