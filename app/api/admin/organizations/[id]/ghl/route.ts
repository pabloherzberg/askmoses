import { randomBytes } from 'node:crypto'
import { type NextRequest } from 'next/server'
import {
  getSession,
  ok,
  unauthorized,
  forbidden,
  notFound,
} from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { requireSameOrigin } from '@/lib/auth/csrf'
import {
  dbGetOrgGhlAdminView,
  dbUpdateOrgGhlConfig,
} from '@/lib/db/organizations'
import type { Role } from '@/lib/types'

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WEBHOOK_PATH = '/api/webhooks/ghl'

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/ghl] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

interface PatchBody {
  locationId?: string | null
  accessToken?: string | null
  enabled?: boolean
  regenerateSecret?: boolean
}

function publicBaseUrl(request: NextRequest): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const origin = request.nextUrl.origin
  return origin.replace(/\/+$/, '')
}

async function requireAdmin() {
  const session = await getSession()
  if (!session) return { error: unauthorized() } as const
  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return { error: forbidden() } as const
  return { session } as const
}

// GET /api/admin/organizations/[id]/ghl
//   Retorna a view mascarada da config GHL da org.
//   Nunca expõe plaintext de token nem secret.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  let view
  try {
    view = await dbGetOrgGhlAdminView(orgId)
  } catch (err) {
    return serverError('Falha ao carregar config GHL', err)
  }
  if (!view) return notFound('Organização')

  return ok({
    ...view,
    webhookUrl: `${publicBaseUrl(request)}${WEBHOOK_PATH}`,
  })
}

// PATCH /api/admin/organizations/[id]/ghl
//   Body: { locationId?, accessToken?, enabled?, regenerateSecret? }
//
//   - locationId trim; vazio = limpa
//   - accessToken vazio = não tocar (preserva valor atual); string = substitui
//   - regenerateSecret: gera secret novo via randomBytes(32)
//   - Primeira config (sem secret atual) força regenerateSecret=true.
//
//   Response inclui webhookSecret EM PLAINTEXT apenas quando o secret foi
//   regenerado nesta requisição. GETs subsequentes só retornam mascarado.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  const rl = await checkRateLimitDb(
    `ghl_config:${guard.session.user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  const { id: orgId } = await params
  if (!orgId || !UUID_RE.test(orgId)) return badRequest('orgId inválido')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const admin = createAdminClient()
  const { data: existing, error: lookupErr } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()
  if (lookupErr) return serverError('Lookup da organização falhou', lookupErr)
  if (!existing) return notFound('Organização')

  let view
  try {
    view = await dbGetOrgGhlAdminView(orgId)
  } catch (err) {
    return serverError('Falha ao carregar view GHL', err)
  }
  if (!view) return notFound('Organização')

  // Normalização dos inputs
  const updates: Parameters<typeof dbUpdateOrgGhlConfig>[1] = {}
  let plaintextSecret: string | null = null

  if (body.locationId !== undefined) {
    const trimmed =
      typeof body.locationId === 'string' ? body.locationId.trim() : ''
    updates.locationId = trimmed === '' ? null : trimmed
  }

  if (body.accessToken !== undefined && body.accessToken !== null) {
    const token =
      typeof body.accessToken === 'string' ? body.accessToken.trim() : ''
    if (token !== '') updates.accessToken = token
    // string vazia = não tocar (preserva token atual). Para limpar, mande null.
  } else if (body.accessToken === null) {
    updates.accessToken = null
  }

  if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled)

  // Regenerar secret: explícito OU primeira config (sem secret no DB)
  const isFirstConfig = !view.hasWebhookSecret
  const shouldRegenerate = body.regenerateSecret === true || isFirstConfig
  if (shouldRegenerate) {
    plaintextSecret = randomBytes(32).toString('hex')
    updates.newWebhookSecret = plaintextSecret
  }

  // Para habilitar a integração precisamos de locationId e accessToken no
  // estado final (atual ou novo).
  if (updates.enabled === true) {
    const finalLocation =
      updates.locationId !== undefined ? updates.locationId : view.locationId
    const finalHasToken =
      updates.accessToken !== undefined && updates.accessToken !== null
        ? true
        : view.hasAccessToken
    if (!finalLocation) {
      return badRequest('locationId é obrigatório para habilitar a integração')
    }
    if (!finalHasToken) {
      return badRequest(
        'accessToken é obrigatório para habilitar a integração',
      )
    }
  }

  try {
    await dbUpdateOrgGhlConfig(orgId, updates)
  } catch (err) {
    return serverError('Update da config GHL falhou', err)
  }

  let updatedView
  try {
    updatedView = await dbGetOrgGhlAdminView(orgId)
  } catch (err) {
    return serverError('Reload da view GHL falhou', err)
  }
  if (!updatedView) return notFound('Organização')

  const webhookUrl = `${publicBaseUrl(request)}${WEBHOOK_PATH}`

  const response: Record<string, unknown> = {
    ...updatedView,
    webhookUrl,
  }

  if (plaintextSecret) {
    response.webhookSecret = plaintextSecret
    response.setup = {
      webhookUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-GHL-Location-Id': updatedView.locationId ?? '',
        'X-AskMoses-Secret': plaintextSecret,
      },
    }
  }

  return ok(response)
}
