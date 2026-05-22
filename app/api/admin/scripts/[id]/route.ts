import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role } from '@/lib/types'

// GET /api/admin/scripts/[id]
// Returns full script row (sections, criteria, etc.) for admin use.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('scripts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return Response.json(
      { data: null, error: { message: 'Script not found', code: 404 } },
      { status: 404 },
    )
  }

  return ok(data)
}
