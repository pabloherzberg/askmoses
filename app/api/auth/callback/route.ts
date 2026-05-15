import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/types'
import { resolveDestination } from '@/lib/auth/post-verify'

// GET /api/auth/callback?code=…&next=…
// Troca o `code` (PKCE) por uma sessão e redireciona pelo destino seguro —
// preferindo `next` quando válido, caindo na home do role do contrário.
// Aceitar convites pendentes NÃO acontece aqui: cada convite é per-org e
// só vira accepted quando o user clica no link específico daquela org
// (verify-invite-token ou verify-otp com orgId).
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const supabase = await createClient()
  const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !exchanged?.session) {
    console.error('[auth] Não foi possível processar o link recebido')
    return NextResponse.redirect(`${origin}/login`)
  }

  const role = exchanged.session.user.app_metadata?.role as Role | undefined

  return NextResponse.redirect(`${origin}${resolveDestination(role, nextRaw)}`)
}
