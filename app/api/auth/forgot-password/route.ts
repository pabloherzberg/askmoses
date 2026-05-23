import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildRecoveryEmail } from '@/lib/email/recovery-template'
import { checkRateLimit, pruneExpiredBuckets } from '@/lib/auth/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 3 recoveries por (email + IP) a cada 15 minutos. Bloqueia spam de inbox
// e enumeration por flooding sem atrapalhar user que digitou errado.
const RECOVERY_LIMIT = 3
const RECOVERY_WINDOW_MS = 15 * 60 * 1000

function genericResponse() {
  return Response.json({ data: { sent: true }, error: null })
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

// POST /api/auth/forgot-password
//   Body: { email, locale? }
//
//   Dispara email de recuperação de senha. Mesma estratégia anti-enumeration
//   do magic-link: resposta única independente de o email existir ou não.
//
//   Geramos o link via `admin.auth.admin.generateLink({ type: 'recovery' })`
//   e construímos a URL apontando pro nosso /api/auth/verify-otp (mesma razão
//   do template de invite: tokens do Supabase chegam em hash fragment que
//   server não enxerga). Assim NÃO dependemos do template padrão do Supabase
//   estar configurado.
//
//   Pode ser chamada por admin (via UI de OwnerManagementCard) ou pelo
//   próprio user via /forgot-password — mesmo endpoint, mesmo rate limit.
export async function POST(request: NextRequest) {
  let body: { email?: string; locale?: string }
  try {
    body = (await request.json()) as { email?: string; locale?: string }
  } catch {
    return genericResponse()
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return genericResponse()
  }

  const ip = clientIp(request)
  const rateKey = `forgot:${email}:${ip}`
  const limit = checkRateLimit(rateKey, RECOVERY_LIMIT, RECOVERY_WINDOW_MS)
  if (!limit.allowed) {
    return genericResponse()
  }

  if (Math.random() < 0.01) pruneExpiredBuckets()

  const admin = createAdminClient()
  const { data: user, error: lookupErr } = await admin
    .from('users')
    .select('id, name, invite_status')
    .eq('email', email)
    .maybeSingle()

  if (lookupErr) {
    console.error('[forgot-password] lookup falhou', lookupErr)
    return genericResponse()
  }

  if (!user || user.invite_status !== 'accepted') {
    // Email desconhecido ou ainda em pending → no-op silencioso.
    return genericResponse()
  }

  const origin = request.nextUrl.origin
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[forgot-password] generateLink falhou', linkErr)
    return genericResponse()
  }

  const tokenHash = linkData.properties.hashed_token
  const actionLink = `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[forgot-password] RESEND_API_KEY ausente — modo mock. action_link=${actionLink}`)
    return genericResponse()
  }

  const { subject, html } = buildRecoveryEmail({
    recipientName: user.name,
    actionLink,
    locale: body.locale,
  })

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? email

  const { error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })

  if (sendErr) {
    console.error('[forgot-password] Resend falhou', sendErr)
  }

  return genericResponse()
}
