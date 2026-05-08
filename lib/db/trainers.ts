import { createAdminClient } from '@/lib/supabase/admin'
import type { Trainer, AvatarColor } from '@/lib/types'

// ─── Sync trainer stats from real calls ──────────────────────────────────────

const SECTION_COLUMN_MAP: Record<string, string> = {
  'discovery':              'score_discovery',
  'problem agitation':      'score_problem_agitation',
  'offer presentation':     'score_offer_presentation',
  'objection handling':     'score_objection_handling',
  'close & next steps':     'score_close_next_steps',
  'close and next steps':   'score_close_next_steps',
}

interface SectionScore { name?: string; score?: number }

export async function syncTrainerStats(trainerId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: calls, error } = await supabase
    .from('calls')
    .select('overall_score, call_outcome, created_at, sections')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[syncTrainerStats] Failed to fetch calls:', error.message)
    return
  }

  if (!calls || calls.length === 0) return

  const total = calls.length
  const closed = calls.filter((c) => c.call_outcome === 'closed').length
  const closeRate = Math.round((closed / total) * 100)
  const avgScore = Math.round(
    calls.reduce((sum, c) => sum + (c.overall_score ?? 0), 0) / total
  )

  // Last active: most recent call date
  const lastActive = calls[0]?.created_at
    ? new Date(calls[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'

  // Rubric section averages — AI returns 0–5, seeded calls store 0–100.
  const sectionSums: Record<string, { sum: number; count: number }> = {}
  for (const call of calls) {
    const items = Array.isArray(call.sections) ? call.sections as SectionScore[] : []
    for (const item of items) {
      const rawName = (item.name ?? '').toLowerCase().trim()
      const col = SECTION_COLUMN_MAP[rawName]
      if (!col) continue
      if (!sectionSums[col]) sectionSums[col] = { sum: 0, count: 0 }
      const raw = item.score ?? 0
      sectionSums[col].sum += raw > 5 ? raw : raw * 20
      sectionSums[col].count += 1
    }
  }

  const rubricPatch: Record<string, number> = {}
  for (const [col, { sum, count }] of Object.entries(sectionSums)) {
    rubricPatch[col] = Math.round(sum / count)
  }

  // Delta vs previous week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recentCalls = calls.filter((c) => c.created_at >= weekAgo)
  const olderCalls = calls.filter((c) => c.created_at < weekAgo)

  let scoreDelta = 0
  let closeDelta = 0
  if (recentCalls.length > 0 && olderCalls.length > 0) {
    const recentAvg = recentCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / recentCalls.length
    const olderAvg = olderCalls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / olderCalls.length
    scoreDelta = Math.round(recentAvg - olderAvg)

    const recentClose = (recentCalls.filter((c) => c.call_outcome === 'closed').length / recentCalls.length) * 100
    const olderClose = (olderCalls.filter((c) => c.call_outcome === 'closed').length / olderCalls.length) * 100
    closeDelta = Math.round(recentClose - olderClose)
  }

  const { error: updateError } = await supabase
    .from('trainers')
    .update({
      total_calls: total,
      score: avgScore,
      score_delta: scoreDelta,
      close_rate: closeRate,
      close_delta: closeDelta,
      last_active: lastActive,
      updated_at: new Date().toISOString(),
      ...rubricPatch,
    })
    .eq('id', trainerId)

  if (updateError) {
    console.error('[syncTrainerStats] Failed to update trainer:', updateError.message)
  }
}

export interface GetTrainersFilters {
  ownerId?: string
  orgId?: string
  /** Inclui trainers cujo user ainda está com invite_status='pending'. Default: false. */
  includePending?: boolean
}

interface DbTrainerRow {
  id: string
  user_id: string
  owner_id: string
  org_id: string | null
  total_calls: number
  close_rate: number
  close_delta: number
  score: number
  score_delta: number
  last_active: string
  score_discovery: number
  score_problem_agitation: number
  score_offer_presentation: number
  score_objection_handling: number
  score_close_next_steps: number
  users: {
    name: string
    email: string
    avatar: string
    avatar_color: AvatarColor
    role: string
  } | null
}

function toTrainer(row: DbTrainerRow): Trainer {
  return {
    id: row.id,
    name: row.users?.name ?? '—',
    email: row.users?.email ?? undefined,
    avatar: row.users?.avatar ?? '??',
    avatarColor: (row.users?.avatar_color ?? 'blue') as AvatarColor,
    role: 'trainer',
    ownerId: row.owner_id,
    orgId: row.org_id ?? undefined,
    totalCalls: row.total_calls ?? 0,
    closeRate: row.close_rate ?? 0,
    closeDelta: row.close_delta ?? 0,
    score: row.score ?? 0,
    scoreDelta: row.score_delta ?? 0,
    lastActive: row.last_active ?? '—',
    rubricScores: {
      discovery: row.score_discovery ?? 0,
      problemAgitation: row.score_problem_agitation ?? 0,
      offerPresentation: row.score_offer_presentation ?? 0,
      objectionHandling: row.score_objection_handling ?? 0,
      closeAndNextSteps: row.score_close_next_steps ?? 0,
    },
  }
}

export async function dbGetTrainers(filters?: GetTrainersFilters): Promise<Trainer[]> {
  const supabase = createAdminClient()
  const includePending = filters?.includePending ?? false

  // Por padrão filtra invite_status='accepted' (escopo de listas operacionais
  // — overview, calls, rankings). includePending=true é necessário pra views
  // administrativas (ex: gestão de convites) que precisam ver pendentes.
  // !inner garante INNER JOIN — sem ele, .eq() em coluna de relação não filtra.
  let query = supabase
    .from('trainers')
    .select('*, users!inner(name, email, avatar, avatar_color, role, invite_status)')
    .order('score', { ascending: false })

  if (!includePending) query = query.eq('users.invite_status', 'accepted')
  if (filters?.orgId) query = query.eq('org_id', filters.orgId)
  else if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)

  const { data, error } = await query

  if (error) throw new Error(`dbGetTrainers: ${error.message}`)

  return (data ?? []).map((row) => toTrainer(row as DbTrainerRow))
}

export async function dbGetTrainerById(id: string): Promise<Trainer | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('*, users(name, email, avatar, avatar_color, role)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetTrainerById: ${error.message}`)
  }

  return toTrainer(data as DbTrainerRow)
}
