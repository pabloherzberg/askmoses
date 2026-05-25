import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { validatePassword } from '@/lib/auth/password'

interface PasswordBody {
  password?: string
  confirm?: string
}

// 5 trocas/user/5min. Bloqueia automation sem atrapalhar quem digitou errado.
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 300

function badRequest(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 400, reason } },
    { status: 400 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[me/password] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

// POST /api/me/password
//   Body: { password, confirm }
//
//   Define ou troca a senha do user atual. Usado em 2 contextos:
//   (1) Primeiro acesso após magic link — Owner/Trainer define senha opcional.
//   (2) Profile page — qualquer user logado troca a senha depois.
//
//   Roda via server client (createClient + cookies) — supabase.auth.updateUser
//   respeita a session do user, então não precisa de admin client + bypass.
//   Magic link continua funcionando depois (definir senha não invalida o
//   método anterior — é uma alternativa, não substituição).
export async function POST(request: NextRequest) {
  // CSRF: state-changing endpoint com cookie auth — exige same-origin.
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return unauthorized()

  // Rate limit por user. Custom (DB-based, sobrevive multi-instance) em
  // cima do throttle do Supabase Auth — segunda camada explícita.
  const rl = await checkRateLimitDb(
    `password:${session.user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  let body: PasswordBody
  try {
    body = (await request.json()) as PasswordBody
  } catch {
    return badRequest('Body inválido')
  }

  const password = body.password
  const confirm = body.confirm

  if (!password || typeof password !== 'string') {
    return badRequest('Senha é obrigatória', 'PASSWORD_REQUIRED')
  }
  const pw = validatePassword(password)
  if (!pw.valid) {
    return badRequest(pw.message ?? 'Senha inválida.', pw.reason)
  }
  if (confirm !== undefined && confirm !== password) {
    return badRequest('Confirmação não confere com a senha.', 'PASSWORD_MISMATCH')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    // 422 com a mensagem do Supabase se for erro de validação semântica
    // (e.g., senha igual à anterior em alguns setups). Demais → 500.
    const code = error.status ?? 500
    if (code >= 400 && code < 500) {
      return Response.json(
        { data: null, error: { message: error.message, code } },
        { status: code },
      )
    }
    return serverError('updateUser falhou', error)
  }

  // Marca password_set=true no app_metadata. Middleware lê esse flag pra
  // decidir se redireciona owner sem senha pra /password (gate obrigatório).
  // Falha aqui não invalida a senha já salva — só loga e segue.
  try {
    const admin = createAdminClient()
    const currentMeta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    const { error: metaErr } = await admin.auth.admin.updateUserById(session.user.id, {
      app_metadata: { ...currentMeta, password_set: true },
    })
    if (metaErr) {
      console.warn('[me/password] mark password_set failed', { userId: session.user.id, err: metaErr.message })
    }
  } catch (err) {
    console.warn('[me/password] mark password_set threw', err)
  }

  return ok({ updated: true })
}
