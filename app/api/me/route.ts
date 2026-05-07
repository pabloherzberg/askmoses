import { type NextRequest } from 'next/server'
import {
  type ActiveOrgContext,
  getActiveOrgContext,
  getActiveOrgContextFor,
  getSession,
  ok,
  unauthorized,
} from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Primary: session do cookie. Fallback: Bearer token (login envia antes do
  // cookie propagar). No fallback NÃO temos cookie, então getActiveOrgContext()
  // (que depende de getSession) retornaria null — usamos a variante explicit
  // getActiveOrgContextFor(userId, isSuperAdmin) com o user resolvido do token.
  let userId: string | null = null
  let isSuperAdmin = false
  let viaSession = false

  const session = await getSession()
  if (session) {
    userId = session.user.id
    isSuperAdmin = session.user.app_metadata?.role === 'admin'
    viaSession = true
  } else {
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (token) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id ?? null
      isSuperAdmin = user?.app_metadata?.role === 'admin'
    }
  }

  if (!userId) return unauthorized()

  const admin = createAdminClient()
  const { data: user } = await admin
    .from('users')
    .select('name')
    .eq('id', userId)
    .single()

  if (!user) return unauthorized()

  // Role canônica vem de getActiveOrgContext (membership na org ativa OU
  // 'admin' do JWT). users.role legado está preso ao último write do setup.
  const ctx: ActiveOrgContext | null = viaSession
    ? await getActiveOrgContext()
    : await getActiveOrgContextFor(userId, isSuperAdmin)
  const role = ctx?.role ?? null

  let trainerId: string | null = null
  if (role === 'trainer' && ctx?.activeOrgId) {
    // Em multi-org, o mesmo user pode ter trainer rows em N orgs (031).
    // Resolvemos a row da org ativa.
    const { data: trainer } = await admin
      .from('trainers')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', ctx.activeOrgId)
      .maybeSingle()
    trainerId = trainer?.id ?? null
  }

  return ok({
    id: userId,
    email: session?.user?.email ?? null,
    name: user.name,
    role,
    trainerId,
  })
}
