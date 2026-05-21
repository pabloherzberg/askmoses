import { type NextRequest } from 'next/server'
import {
  getActiveOrgContext,
  getTrainerDbId,
  ok,
  unauthorized,
  forbidden,
} from '@/lib/auth'
import { dbGetChannelPrefs, dbUpsertChannelPrefs } from '@/lib/db/notifications'

function badRequest(message: string) {
  return Response.json({ data: null, error: { message, code: 400 } }, { status: 400 })
}

function serverError(message: string) {
  return Response.json({ data: null, error: { message, code: 500 } }, { status: 500 })
}

// ── GET — trainer lê as próprias preferências de canal ──────────────────────
export async function GET() {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()
    if (ctx.role !== 'trainer') return forbidden()
    const trainerId = await getTrainerDbId()
    if (!trainerId) return forbidden()

    const prefs = await dbGetChannelPrefs(trainerId)
    return ok(prefs)
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Erro ao carregar preferências')
  }
}

// ── PUT — trainer atualiza as próprias preferências de canal ────────────────
// Só o próprio trainer escreve as próprias prefs (escopo por getTrainerDbId).
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getActiveOrgContext()
    if (!ctx) return unauthorized()
    if (ctx.role !== 'trainer') return forbidden()
    const trainerId = await getTrainerDbId()
    if (!trainerId) return forbidden()

    let body: { inApp?: unknown; email?: unknown }
    try {
      body = await request.json()
    } catch {
      return badRequest('JSON inválido')
    }

    if (typeof body.inApp !== 'boolean' || typeof body.email !== 'boolean') {
      return badRequest('inApp e email devem ser boolean')
    }

    await dbUpsertChannelPrefs(trainerId, { inApp: body.inApp, email: body.email })
    return ok({ inApp: body.inApp, email: body.email })
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Erro ao salvar preferências')
  }
}
