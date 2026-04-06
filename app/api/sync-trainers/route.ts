import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncTrainerStats } from '@/lib/db/trainers'
import { ok } from '@/lib/auth'

export async function POST(_request: NextRequest) {
  const supabase = createAdminClient()

  const { data: trainers, error } = await supabase
    .from('trainers')
    .select('id')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results = await Promise.allSettled(
    (trainers ?? []).map((t) => syncTrainerStats(t.id))
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  const succeeded = results.length - failed

  return ok({ synced: succeeded, failed, total: results.length })
}
