import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

interface PasswordBody {
  password?: string
  confirm?: string
}

const MIN_PASSWORD_LENGTH = 8

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
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return unauthorized()

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
  if (password.length < MIN_PASSWORD_LENGTH) {
    return badRequest(
      `Senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      'PASSWORD_TOO_SHORT',
    )
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

  return ok({ updated: true })
}
