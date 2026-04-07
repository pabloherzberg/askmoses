import { createAdminClient } from '@/lib/supabase/admin'
import type { Trainer, AvatarColor, Role } from '@/lib/types'

export interface GetTrainersFilters {
  ownerId?: string
}

interface DbTrainer {
  id: string
  user_id: string | null
  owner_id: string | null
  total_calls: number | null
  close_rate: number | null
  close_delta: number | null
  score: number | null
  score_delta: number | null
  last_active: string | null
  score_discovery: number | null
  score_problem_agitation: number | null
  score_offer_presentation: number | null
  score_objection_handling: number | null
  score_close_next_steps: number | null
  users: { name: string; role: string } | null
}

const AVATAR_COLORS: AvatarColor[] = ['blue', 'purple', 'green', 'red']

function toTrainer(db: DbTrainer, index = 0): Trainer {
  const name = db.users?.name ?? db.user_id ?? 'Unknown'
  return {
    id: db.id,
    name,
    avatar: name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    role: (db.users?.role ?? 'trainer') as Role,
    totalCalls: db.total_calls ?? 0,
    closeRate: db.close_rate ?? 0,
    closeDelta: db.close_delta ?? 0,
    score: db.score ?? 0,
    scoreDelta: db.score_delta ?? 0,
    lastActive: db.last_active ?? '—',
    ownerId: db.owner_id ?? '',
    rubricScores: {
      discovery: db.score_discovery ?? 0,
      problemAgitation: db.score_problem_agitation ?? 0,
      offerPresentation: db.score_offer_presentation ?? 0,
      objectionHandling: db.score_objection_handling ?? 0,
      closeAndNextSteps: db.score_close_next_steps ?? 0,
    },
  }
}

const SELECT = '*, users(name, role)'

export async function dbGetTrainers(filters?: GetTrainersFilters): Promise<Trainer[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('trainers')
    .select(SELECT)
    .order('score', { ascending: false })

  if (filters?.ownerId) query = query.eq('owner_id', filters.ownerId)

  const { data, error } = await query

  if (error) throw new Error(`dbGetTrainers: ${error.message}`)

  return (data ?? []).map((row, i) => toTrainer(row as DbTrainer, i))
}

export async function dbGetTrainerById(id: string): Promise<Trainer | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select(SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetTrainerById: ${error.message}`)
  }

  return toTrainer(data as DbTrainer)
}
