import { createAdminClient } from '@/lib/supabase/admin'
import type { Trainer, AvatarColor } from '@/lib/types'

export interface GetTrainersFilters {
  ownerId?: string
}

interface DbTrainerRow {
  id: string
  user_id: string
  owner_id: string
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
    avatar: string
    avatar_color: AvatarColor
    role: string
  } | null
}

function toTrainer(row: DbTrainerRow): Trainer {
  return {
    id: row.id,
    name: row.users?.name ?? '—',
    avatar: row.users?.avatar ?? '??',
    avatarColor: (row.users?.avatar_color ?? 'blue') as AvatarColor,
    role: 'trainer',
    ownerId: row.owner_id,
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

  let query = supabase
    .from('trainers')
    .select('*, users(name, avatar, avatar_color, role)')
    .order('score', { ascending: false })

  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)

  const { data, error } = await query

  if (error) throw new Error(`dbGetTrainers: ${error.message}`)

  return (data ?? []).map((row) => toTrainer(row as unknown as DbTrainerRow))
}

export async function dbGetTrainerById(id: string): Promise<Trainer | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('*, users(name, avatar, avatar_color, role)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetTrainerById: ${error.message}`)
  }

  return toTrainer(data as unknown as DbTrainerRow)
}
