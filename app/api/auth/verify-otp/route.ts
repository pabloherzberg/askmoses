import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isValidOtpType, type Role } from '@/lib/types'
import { markInviteAccepted, resolveDestination } from '@/lib/auth/post-verify'

// GET /api/auth/verify-otp?token_hash=…&type=invite|magiclink|recovery|email_change&next=…
//
// Verifica o token server-side via SDK (verifyOtp). Substitui o fluxo
// /auth/v1/verify do Supabase, que redireciona com tokens em hash fragment —
// fragmento não chega ao servidor, então um callback de API não consegue
// estabelecer sessão. Aqui fazemos a verificação direto e setamos cookies
// no Response.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const typeRaw = searchParams.get('type')
  const nextRaw = searchParams.get('next')
  const orgIdRaw = searchParams.get('orgId')

  if (!tokenHash || !isValidOtpType(typeRaw)) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // type=invite exige orgId — sem ele não dá pra aceitar uma membership
  // específica. Links pré-fix (sem orgId) caem aqui; tratamos como expirado
  // pra não autenticar um user que ficaria sem acesso (membership pending +
  // RLS bloqueando tudo). A tela de login mostra a mensagem via ?error.
  if (typeRaw === 'invite' && !orgIdRaw) {
    console.warn('[verify-otp] type=invite sem orgId — link pré-fix tratado como expirado')
    return NextResponse.redirect(`${origin}/login?error=invite_expired`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeRaw })
  if (error || !data?.session) {
    console.error('[auth] Não foi possível processar o link recebido')
    return NextResponse.redirect(`${origin}/login`)
  }

  const userId = data.session.user.id
  const role = data.session.user.app_metadata?.role as Role | undefined

  if (typeRaw === 'invite' && orgIdRaw) {
    await markInviteAccepted(userId, orgIdRaw)
  }

  const homePath = resolveDestination(role, nextRaw)

  // Primeiro acesso após invite aceito: redireciona pra /password?welcome=1
  // com next=<home original>. Página mostra banner "definir senha agora ou
  // pular" — decisão Victor 2026-05-13: magic link continua funcionando, a
  // senha é opcional. Apenas pro fluxo invite — magiclink/recovery vão direto.
  if (typeRaw === 'invite') {
    return NextResponse.redirect(
      `${origin}/password?welcome=1&next=${encodeURIComponent(homePath)}`,
    )
  }

  return NextResponse.redirect(`${origin}${homePath}`)
}
