import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMagicLinkEmail } from '@/lib/email/magic-link-template'
import { checkRateLimit, pruneExpiredBuckets } from '@/lib/auth/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 3 magic links por email a cada 5 minutos. Repõe o throttle do
// signInWithOtp (que perdemos ao migrar pra generateLink).
const MAGIC_LINK_LIMIT = 3
const MAGIC_LINK_WINDOW_MS = 5 * 60 * 1000

// Resposta única — toda chamada retorna isso, independente de o email existir,
// ser inválido, estar rate-limited ou de o provedor falhar. Defesa contra
// enumeração de usuários e contra distinguir paths de erro.
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

// POST /api/auth/magic-link
//   Body: { email, locale? }
//   - Rate-limited por (email + IP) — 3 envios/5min
//   - Email desconhecido → no-op silencioso (mesma resposta)
//   - Email pendente (não aceitou convite ainda) → no-op silencioso
//   - Email aceito → gera token via admin.generateLink + envia HTML via Resend
//   Esta rota nunca cria usuários. O fluxo de cadastro é exclusivo do convite.
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

  // Rate limit ANTES de qualquer DB lookup — protege também contra fishing
  // de existência baseado em latência da query.
  const ip = clientIp(request)
  const rateKey = `magiclink:${email}:${ip}`
  const limit = checkRateLimit(rateKey, MAGIC_LINK_LIMIT, MAGIC_LINK_WINDOW_MS)
  if (!limit.allowed) {
    return genericResponse()
  }

  // GC oportunístico
  if (Math.random() < 0.01) pruneExpiredBuckets()

  const admin = createAdminClient()
  const { data: user, error: lookupErr } = await admin
    .from('users')
    .select('id, name, invite_status')
    .eq('email', email)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth] Não foi possível verificar o destinatário do link')
    return genericResponse()
  }

  if (!user || user.invite_status !== 'accepted') {
    // Email desconhecido ou ainda em pending — não envia (resposta idêntica).
    // Pendentes têm que aceitar o convite original; magic link só vale pra
    // quem já completou o onboarding.
    return genericResponse()
  }

  const origin = request.nextUrl.origin
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[auth] Não foi possível gerar o magic link')
    return genericResponse()
  }

  const tokenHash = linkData.properties.hashed_token
  const actionLink = `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[auth] RESEND_API_KEY ausente — magic link em modo mock. action_link=${actionLink}`)
    return genericResponse()
  }

  const { subject, html } = buildMagicLinkEmail({
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
    console.error('[auth] Resend falhou ao enviar magic link', sendErr)
  }

  return genericResponse()
}
