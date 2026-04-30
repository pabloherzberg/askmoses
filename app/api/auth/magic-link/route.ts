import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMagicLinkEmail } from '@/lib/email/magic-link-template'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Resposta única — toda chamada retorna isso, independente de o email existir,
// ser inválido, ou de o provedor falhar. Defesa contra enumeração de usuários.
function genericResponse() {
  return Response.json({ data: { sent: true }, error: null })
}

// POST /api/auth/magic-link
//   Body: { email, locale? }
//   Comportamento:
//     - Se o email NÃO existir em public.users → no-op silencioso
//     - Se existir → gera token via admin.generateLink (sem disparar email do
//       Supabase) e envia HTML próprio via Resend, apontando pra
//       /api/auth/accept-invite (que faz verifyOtp server-side).
//     - Sempre retorna a mesma resposta genérica
//   Esta rota nunca cria usuários. O fluxo de cadastro é exclusivo do convite
//   (POST /api/invites).
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

  const origin = request.headers.get('origin') ?? request.nextUrl.origin
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[auth] Não foi possível gerar o magic link')
    return genericResponse()
  }

  const tokenHash = linkData.properties.hashed_token
  const actionLink = `${origin}/api/auth/accept-invite?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn(`[auth] RESEND_API_KEY ausente — magic link em modo mock. action_link=${actionLink}`)
    return genericResponse()
  }

  const { subject, html } = buildMagicLinkEmail({
    inviteeName: user.name,
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
