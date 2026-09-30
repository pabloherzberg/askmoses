import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncTrainerStats } from '@/lib/db/trainers'
import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'

// POST /api/sync-trainers
//   Recalcula o cache de stats (close_rate, score, deltas, rubrica) de TODOS os
//   trainers de TODAS as orgs, via service_role. Admin only.
//
//   Até 30/09/2026 esta rota não checava nada — o middleware exclui /api do
//   matcher, então um POST anônimo disparava o recálculo inteiro em prod.
//   Não apaga dado (só reescreve o cache em `trainers`), mas é carga no banco
//   sob comando de qualquer um.
export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const supabase = createAdminClient()

  const { data: trainers, error } = await supabase
    .from('trainers')
    .select('id')

  if (error) {
    console.error('[sync-trainers] failed to list trainers', error.message)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }

  const results = await Promise.allSettled(
    (trainers ?? []).map((t) => syncTrainerStats(t.id))
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  const succeeded = results.length - failed

  return ok({ synced: succeeded, failed, total: results.length })
}
