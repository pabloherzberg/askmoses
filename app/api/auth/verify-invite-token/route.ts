import { type NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDestination } from '@/lib/auth/post-verify'
import type { Role } from '@/lib/types'

// GET /api/auth/verify-invite-token?token=…&next=…
//
// Callback dos convites reenviados (POST /api/invites/[id]/resend, migration
// 034). Diferente do verify-otp, este endpoint trabalha com nosso próprio
// token (tabela invite_tokens), que é per-(user, org) — clicar aqui aceita
// SOMENTE a membership específica daquele token, sem afetar pendências do
// mesmo user em outras orgs.
//
// Fluxo:
//   1) hash SHA-256 do token cleartext
//   2) consume_invite_token RPC: atomic, marca consumed_at e devolve (user_id, org_id).
//      Se já foi usado / expirou / foi invalidado → linha vazia, redirect login.
//   3) marca a membership específica accepted (e users.invite_status, p/ compat)
//   4) seta users.active_org_id pra org aceita (UX: usuário entra no contexto certo)
//   5) gera magic link supabase pra criar sessão
//   6) redireciona pra verify-otp, que cria o cookie e leva pra home
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const { searchParams } = request.nextUrl
  const tokenCleartext = searchParams.get('token')
  const nextRaw = searchParams.get('next')

  if (!tokenCleartext) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const tokenHash = createHash('sha256').update(tokenCleartext).digest('hex')
  const admin = createAdminClient()

  // ─── 1. Consome o token (atomic, one-shot) ─────────────────────────────
  const { data: consumed, error: rpcErr } = await admin.rpc('consume_invite_token', {
    p_token_hash: tokenHash,
  })
  if (rpcErr) {
    console.error('[verify-invite-token] consume_invite_token falhou', rpcErr)
    return NextResponse.redirect(`${origin}/login?error=invite_expired`)
  }

  // RPC retorna SETOF (user_id, org_id). PostgREST devolve array; vazio quando
  // o token não estava válido (consumido/expirado/invalidado/inexistente).
  // Não distinguimos os 4 casos no redirect — a ação do usuário é sempre a
  // mesma: pedir reenvio ao admin. Mensagem renderizada via i18n key
  // `Login.inviteExpired` em app/[locale]/(auth)/login/page.tsx.
  const row = Array.isArray(consumed) ? consumed[0] : consumed
  if (!row?.user_id || !row?.org_id) {
    console.warn('[verify-invite-token] token inválido, expirado ou já consumido')
    return NextResponse.redirect(`${origin}/login?error=invite_expired`)
  }

  const userId = row.user_id as string
  const orgId = row.org_id as string

  // ─── 2. Marca a membership ESPECÍFICA accepted ─────────────────────────
  // Diferente do markInviteAccepted (que aceita TODAS as pendentes do user),
  // aqui aceitamos só (user, org) — coerente com o modelo per-membership.
  const { error: memErr } = await admin
    .from('memberships')
    .update({ invite_status: 'accepted' })
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('invite_status', 'pending')
  if (memErr) {
    console.error('[verify-invite-token] update membership falhou', memErr, { userId, orgId })
    // Token já foi consumido — não dá pra rollback. Loga e segue: o user
    // ainda consegue entrar; o estado da membership será corrigido por job.
  }

  // users.invite_status (legado) precisa ir pra accepted também — magic-link
  // gate e dbGetTrainers ainda leem dele (ver post-verify.ts:14-22).
  await admin
    .from('users')
    .update({ invite_status: 'accepted' })
    .eq('id', userId)
    .eq('invite_status', 'pending')

  // ─── 3. Define active_org_id pra org recém-aceita ──────────────────────
  // Se for o primeiro convite aceito do user, active_org_id ainda é a org
  // original. Aqui forçamos pra org deste invite — o user clicou no link
  // dela, é onde ele espera entrar.
  await admin
    .from('users')
    .update({ active_org_id: orgId })
    .eq('id', userId)

  // ─── 4. Resolve email pra gerar magic link ─────────────────────────────
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  if (userErr || !userRow?.email) {
    console.error('[verify-invite-token] não encontrou email do user', userErr, { userId })
    return NextResponse.redirect(`${origin}/login`)
  }

  // ─── 5. Gera magic link supabase pra criar a sessão ────────────────────
  // Reusamos verify-otp (que faz verifyOtp + seta cookies). É a única forma
  // de bootstrap de sessão server-side com supabase-js sem o user já estar
  // autenticado.
  //
  // Role pra resolveDestination tem que vir de memberships.role do par
  // (userId, orgId) consumido — não de users.role (legado, single-org).
  // Em multi-org o user pode ser trainer numa org e owner em outra; o
  // home path certo depende de qual convite acabou de ser aceito.
  const { data: membership } = await admin
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  const role = (membership?.role as Role | undefined) ?? undefined
  const homePath = resolveDestination(role, nextRaw)

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: userRow.email,
    options: {
      redirectTo: `${origin}/api/auth/verify-otp?next=${encodeURIComponent(homePath)}`,
    },
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[verify-invite-token] generateLink falhou', linkErr, { userId })
    return NextResponse.redirect(`${origin}/login`)
  }

  const tokenHashSupabase = linkData.properties.hashed_token
  return NextResponse.redirect(
    `${origin}/api/auth/verify-otp?token_hash=${encodeURIComponent(tokenHashSupabase)}&type=magiclink&next=${encodeURIComponent(homePath)}`
  )
}
