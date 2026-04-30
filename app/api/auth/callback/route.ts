import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

const HOME: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }

// GET /api/auth/callback?code=…&next=…
// Troca o `code` (PKCE) por uma sessão. Se o usuário tem convite pendente,
// marca como aceito (idempotente). Por fim redireciona para o destino —
// preferindo `next` quando válido, caindo na home do role do contrário.
// O parâmetro `next` é validado para evitar open-redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
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

  const userId = exchanged.session.user.id
  const role = exchanged.session.user.app_metadata?.role as Role | undefined

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
