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

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeRaw })
  if (error || !data?.session) {
    console.error('[auth] Não foi possível processar o link recebido')
    return NextResponse.redirect(`${origin}/login`)
  }

  const userId = data.session.user.id
  const role = data.session.user.app_metadata?.role as Role | undefined

  // type=invite só aceita a membership da org que está no link. Sem orgId
  // não dá pra saber qual org o user está confirmando — logamos e seguimos
  // sem aceitar nada (a membership fica pending até o user clicar num link
  // que carregue orgId).
  if (typeRaw === 'invite') {
    if (orgIdRaw) {
      await markInviteAccepted(userId, orgIdRaw)
    } else {
      console.warn('[verify-otp] type=invite sem orgId — nenhuma membership aceita', { userId })
    }
  }

  return NextResponse.redirect(`${origin}${resolveDestination(role, nextRaw)}`)
}
