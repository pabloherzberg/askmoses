import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Primary: session from cookie (normal flow)
  let userId: string | null = null

  const session = await getSession()
  if (session) {
    userId = session.user.id
  } else {
    // Fallback: Bearer token passed by login page before cookie propagates
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
    .select('name, role')
    .eq('id', userId)
    .single()

  if (!user) return unauthorized()

  let trainerId: string | null = null
  if (user.role === 'trainer') {
    const { data: trainer } = await admin
      .from('trainers')
      .select('id')
      .eq('user_id', userId)
      .single()
    trainerId = trainer?.id ?? null
  }

  return ok({
    id: userId,
    email: session?.user?.email ?? null,
    name: user.name,
    role: user.role,
    trainerId,
  })
}
