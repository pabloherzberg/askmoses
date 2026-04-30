import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const HOME: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }

type OtpType = 'invite' | 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'email'

// GET /api/auth/accept-invite?token_hash=…&type=invite&next=…
//
// Verifica o token do convite server-side (via verifyOtp). Substitui o fluxo
// /auth/v1/verify do Supabase, que redireciona com tokens no hash fragment —
// fragmento não chega ao servidor, então um callback de API não consegue
// estabelecer sessão. Aqui fazemos a verificação com SDK e setamos cookies
// no Response, igual ao fluxo PKCE.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = (searchParams.get('type') ?? 'invite') as OtpType
  const nextRaw = searchParams.get('next')

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error || !data?.session) {
    console.error('[auth] Não foi possível processar o link recebido')
    return NextResponse.redirect(`${origin}/login`)
  }

  const userId = data.session.user.id
  const role = data.session.user.app_metadata?.role as Role | undefined

  // Idempotente: só transiciona pending → accepted
  const admin = createAdminClient()
  await admin
    .from('users')
    .update({ invite_status: 'accepted' })
    .eq('id', userId)
    .eq('invite_status', 'pending')

  // Aceita apenas paths internos (evita //evil.com e fully-qualified URLs)
  const safeNext =
    nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null

  const destination = safeNext ?? (role ? HOME[role] : '/login')
  return NextResponse.redirect(`${origin}${destination}`)
}
