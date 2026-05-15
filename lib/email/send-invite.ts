import { randomBytes, createHash } from 'crypto'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInviteEmail } from './invite-template'

// Validade do token. 48h conforme spec do email de convite — o ctaHint
// no template informa explicitamente esse prazo.
// O DB não impõe expiração — quem decide é este TTL (gravado em
// invite_tokens.expires_at) + a checagem `expires_at > now()` dentro da RPC
// `consume_invite_token` (migration 034). Mudou aqui? Atualizar também o
// ctaHint em lib/email/invite-template.ts pra manter coerência com o usuário.
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000

export type InviteEmailDelivery = 'sent' | 'mocked'

export interface SendInviteParams {
  userId: string
  orgId: string
  role: 'trainer' | 'owner'
  inviteeName: string
  inviteeEmail: string
  orgName: string
  inviterId: string | null
  origin: string
  locale?: string
}

export interface SendInviteResult {
  emailDelivery: InviteEmailDelivery
  emailId: string | null
}

// Gera token próprio (tabela invite_tokens, migration 034) + envia email.
// Compartilhado entre POST /api/invites Branch A (user existente convidado
// pra nova org) e POST /api/invites/[id]/resend (reenvio).
//
// Sequência (idempotente — pode chamar várias vezes pra mesma membership):
//   1) invalida tokens ativos da (user, org) via RPC — se 2 reenvios
//      concorrerem, a partial unique index garante que só sobre 1 ativo.
//   2) gera 32B random + SHA-256, persiste só o hash. Cleartext só no email.
//   3) atualiza memberships.invited_at pra refletir o último envio na UI.
//   4) monta action link e dispara via Resend.
//
// Lança em qualquer falha de DB ou API key inválida do Resend. Caller
// é responsável por rollback de estado dependente.
export async function sendInviteEmail(params: SendInviteParams): Promise<SendInviteResult> {
  const admin = createAdminClient()

  // ─── 1. Invalida tokens ativos ──────────────────────────────────────────
  const { error: invalidateErr } = await admin.rpc('invalidate_active_invite_tokens', {
    p_user_id: params.userId,
    p_org_id: params.orgId,
  })
  if (invalidateErr) {
    throw new Error(`invalidate_active_invite_tokens falhou: ${invalidateErr.message}`)
  }

  // ─── 2. Gera + persiste token ───────────────────────────────────────────
  const cleartext = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(cleartext).digest('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  const { error: insertErr } = await admin.from('invite_tokens').insert({
    user_id: params.userId,
    org_id: params.orgId,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: params.inviterId,
  })
  if (insertErr) {
    throw new Error(`insert invite_tokens falhou: ${insertErr.message}`)
  }

  // ─── 3. Atualiza invited_at (não-bloqueante, só telemetria de UI) ───────
  await admin
    .from('memberships')
    .update({ invited_at: new Date().toISOString() })
    .eq('user_id', params.userId)
    .eq('org_id', params.orgId)

  // ─── 4. Monta link e envia ──────────────────────────────────────────────
  const homePath = params.role === 'trainer' ? '/me' : '/dashboard'
  const actionLink = `${params.origin}/api/auth/verify-invite-token?token=${encodeURIComponent(cleartext)}&next=${encodeURIComponent(homePath)}`

  // Resolve nome do convidante pro corpo do email (opcional).
  let inviterName: string | null = null
  if (params.inviterId) {
    const { data: inviterRow } = await admin
      .from('users')
      .select('name')
      .eq('id', params.inviterId)
      .maybeSingle()
    inviterName = inviterRow?.name ?? null
  }

  const { subject, html } = buildInviteEmail({
    inviteeName: params.inviteeName,
    role: params.role,
    orgName: params.orgName,
    inviterName,
    actionLink,
    locale: params.locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // NÃO logar o action_link inteiro — contém o token cleartext (?token=…)
    // que é credencial de uso único. Logamos só o prefixo do hash (já é
    // SHA-256 e irreversível) pra auditoria/correlação no DB.
    console.warn(
      `[send-invite] RESEND_API_KEY ausente — modo mock. user_id=${params.userId} org_id=${params.orgId} token_hash_prefix=${hash.slice(0, 8)}`
    )
    return { emailDelivery: 'mocked', emailId: null }
  }

  const resend = new Resend(apiKey)
  const devOverride = process.env.DEV_EMAIL_OVERRIDE
  const toAddress = devOverride ?? params.inviteeEmail

  const { data: emailResult, error: sendErr } = await resend.emails.send({
    from: 'AskMoses.AI <noreply@askmoses.ai>',
    to: toAddress,
    subject,
    html,
  })
  if (sendErr) {
    throw new Error(`Resend falhou: ${sendErr.message ?? 'unknown'}`)
  }

  return { emailDelivery: 'sent', emailId: emailResult?.id ?? null }
}
