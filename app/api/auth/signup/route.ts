import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSignupEmail } from '@/lib/email/signup-template'
import { checkRateLimit, pruneExpiredBuckets } from '@/lib/auth/rate-limit'
import { validatePassword } from '@/lib/auth/password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_MIN = 2
const NAME_MAX = 80

// 5 signups por IP a cada 10 minutos. Suficiente pra reenvios manuais de
// quem perdeu o email, restritivo o bastante pra travar bot signup.
const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 10 * 60 * 1000

interface SignupBody {
  name?: string
  email?: string
  password?: string
  locale?: string
}

function badRequest(message: string, reason?: string) {
  return Response.json(
    { data: null, error: { message, code: 400, ...(reason ? { reason } : {}) } },
    { status: 400 }
  )
}

function tooMany(message: string) {
  return Response.json(
    { data: null, error: { message, code: 429, reason: 'RATE_LIMITED' } },
    { status: 429 }
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[auth/signup] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Não foi possível criar a conta.', code: 500 } },
    { status: 500 }
  )
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

// POST /api/auth/signup
//   Body: { name, email, password, locale? }
//   Cria user no Supabase Auth via admin.generateLink (type='signup') e
//   dispara o email de confirmação via Resend — Supabase apenas gera o
//   hashed_token. Após clicar no link, /api/auth/verify-otp finaliza a
//   verificação e cria sessão. Middleware vê user-sem-role e redireciona
//   pra /onboarding.
//
//   Não usa supabase.auth.signUp() client-side porque queremos:
//     1) Template de email branded (Resend, igual invite/magic link)
//     2) Controle de locale no email
//     3) Pipeline consistente com os outros emails do app
//
//   Diferente de /api/auth/magic-link, esse endpoint retorna erros
//   específicos (email já registrado, password fraco) — user no signup
//   está cadastrando ativamente, conhecer o estado da conta é útil
//   (e não vaza nada que ele não pudesse descobrir tentando logar).
export async function POST(request: NextRequest) {
  let body: SignupBody
  try {
    body = (await request.json()) as SignupBody
  } catch {
    return badRequest('Body inválido')
  }

  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password
  const locale = body.locale

  if (!name || name.length < NAME_MIN || name.length > NAME_MAX) {
    return badRequest(`name deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres`, 'NAME_INVALID')
  }
  if (!email || !EMAIL_RE.test(email)) {
    return badRequest('email inválido', 'EMAIL_INVALID')
  }
  if (!password || typeof password !== 'string') {
    return badRequest('password é obrigatório', 'PASSWORD_INVALID')
  }
  const pw = validatePassword(password)
  if (!pw.valid) {
    // reason mantém 'PASSWORD_INVALID' (genérico) pra não quebrar o branch
    // existente do frontend; a mensagem específica vai em `message`.
    return badRequest(pw.message ?? 'password inválido', 'PASSWORD_INVALID')
  }

  // Rate limit em 2 buckets independentes:
  //   - signup:ip:<ip>      → 5/10min por IP (trava bot variando emails do mesmo IP)
  //   - signup:email:<email>→ 5/10min por email (trava distribuído com IPs proxy)
  // Chave composta (IP+email) que tínhamos antes deixava cada email do mesmo
  // IP com seu próprio bucket — bot conseguia signup ilimitado variando email.
  const ip = clientIp(request)
  const ipLimit    = checkRateLimit(`signup:ip:${ip}`,       SIGNUP_LIMIT, SIGNUP_WINDOW_MS)
  const emailLimit = checkRateLimit(`signup:email:${email}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS)
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return tooMany('Muitas tentativas. Tente novamente em alguns minutos.')
  }
  if (Math.random() < 0.01) pruneExpiredBuckets()

  const admin = createAdminClient()

  // generateLink({ type: 'signup' }) cria o auth.users com password hashed
  // bcrypt e email não confirmado, retornando o hashed_token sem disparar
  // o email do Supabase (que precisaria de SMTP configurado no projeto).
  // user_metadata.name vai pro auth.users e é lido depois pelo POST
  // /api/onboarding/organization pra popular public.users.name.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      data: { name },
    },
  })

  if (linkErr || !linkData?.user || !linkData.properties?.hashed_token) {
    // Mensagem do Supabase costuma ser EN; mapear cases comuns pra reasons
    // específicas que o frontend traduz. Sem leak: "user already registered"
    // não vaza info que o user não conseguiria via /login.
    const errMsg = linkErr?.message?.toLowerCase() ?? ''
    if (errMsg.includes('already registered') || errMsg.includes('user already exists')) {
      return badRequest('Este e-mail já está cadastrado.', 'EMAIL_ALREADY_REGISTERED')
    }
    if (errMsg.includes('password')) {
      return badRequest('Senha rejeitada pelo provedor de auth.', 'PASSWORD_REJECTED')
    }
    return serverError('generateLink falhou', linkErr)
  }

  const newUserId = linkData.user.id
  const tokenHash = linkData.properties.hashed_token

  const origin = request.nextUrl.origin
  // next sem prefixo de locale — segue o padrão dos outros fluxos (invites
  // usa '/me' ou '/dashboard'). Locale é resolvido pelo next-intl middleware
  // no redirect final, baseado em Accept-Language do user. Incluir locale
  // aqui não funciona porque isSafeNextPath (lib/auth/post-verify) só aceita
  // paths em SAFE_NEXT_PATHS — caminhos prefixados com locale são rejeitados
  // e caem no fallback genérico, fazendo o locale do email se perder.
  const nextPath = '/onboarding'
  const actionLink = `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHash)}&type=signup&next=${encodeURIComponent(nextPath)}`

  const { subject, html } = buildSignupEmail({
    recipientName: name,
    actionLink,
    locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Modo dev sem Resend: NÃO logar o action_link cleartext (contém o
    // token de confirmação). Logamos só o prefixo do hash pra auditoria.
    console.warn(
      `[auth/signup] RESEND_API_KEY ausente — modo mock. user_id=${newUserId} token_hash_prefix=${tokenHash.slice(0, 8)}`
    )
    return Response.json({
      data: { sent: false, mocked: true, userId: newUserId },
      error: null,
    })
  }

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? email

  const { data: emailResult, error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })

  if (sendErr) {
    // Rollback: o user foi criado em auth.users mas o email não saiu.
    // Sem rollback ele ficaria "preso" — não consegue logar (não confirmou
    // email) nem se cadastrar de novo (email_already_registered). Deletar
    // permite retry limpo.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    return serverError('Resend falhou ao enviar email de signup', sendErr)
  }

  return Response.json({
    data: { sent: true, emailId: emailResult?.id ?? null },
    error: null,
  })
}
