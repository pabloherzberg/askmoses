import { type NextRequest } from 'next/server'
import { getActiveOrgContext, getSession, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Primary: session do cookie. Fallback: Bearer token (login envia antes do cookie propagar).
  let userId: string | null = null

  const session = await getSession()
  if (session) {
    userId = session.user.id
  } else {
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (token) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id ?? null
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
  // 'admin' do JWT). users.role é deprecado — em multi-org ele fica preso
  // ao último write do setup, então não serve pra rotear o frontend.
  const ctx = await getActiveOrgContext()
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
