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

// ─── Vínculo membro ↔ usuário GHL ────────────────────────────────────────
// Toda ligação GHL vive em `trainers.ghl_user_id`. Um vendedor tem sua linha
// criada no convite; um owner que também faz calls ganha uma linha em
// `trainers` (perfil de calls, owner_id apontando pra si mesmo) — assim
// scoring/ranking/coaching/`/me` são reaproveitados sem tocar no modelo de
// papéis. Um mesmo usuário GHL não pode ser reusado por dois trainers da
// mesma org (índice único trainers_org_ghl_user_id_uidx).

/** Vínculo GHL resolvido de uma call: o trainer dono do ghl_user_id e se o
 *  invite dele já foi aceito (= membro ativo, calls analisáveis). */
export interface GhlTrainerLink {
  trainerId: string
  userId: string
  name: string
  /** invite aceito → membro ativo. Pendente/sem linha → call fica bloqueada. */
  inviteAccepted: boolean
}

/**
 * Resolve o membro responsável por uma call da GHL a partir do ghl_user_id
 * (GHLUSERID do payload). Retorna null quando NENHUM trainer da org está
 * vinculado a esse GHLUSERID — nesse caso a call não pode ser atribuída.
 *
 * `inviteAccepted` distingue o vínculo ativo (invite aceito → pode analisar)
 * do pendente (linha existe, mas o membro ainda não aceitou → bloqueia). O
 * gate do webhook usa esse flag pra decidir entre analisar e bloquear a call.
 */
export async function dbGetTrainerByGhlUserId(
  orgId: string,
  ghlUserId: string,
): Promise<GhlTrainerLink | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('id, user_id, users!inner(name, invite_status)')
    .eq('org_id', orgId)
    .eq('ghl_user_id', ghlUserId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetTrainerByGhlUserId: ${error.message}`)
  }
  if (!data) return null

  const user = data.users as { name?: string; invite_status?: string } | null
  return {
    trainerId: data.id as string,
    userId: data.user_id as string,
    name: user?.name ?? '—',
    inviteAccepted: user?.invite_status === 'accepted',
  }
}

/**
 * Retorna os ghl_user_id já vinculados a trainers de uma org. Usado para
 * filtrar a lista de candidatos do GHL (não oferecer um usuário já em uso)
 * e para checar unicidade antes de gravar um vínculo.
 *
 * Inclui pending e accepted — um convite pendente já "reserva" o usuário
 * GHL. `excludeUserId` deixa de fora o próprio membro (edição, para que ele
 * mantenha o vínculo atual).
 */
export async function dbGetLinkedGhlUserIds(
  orgId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('trainers')
    .select('ghl_user_id, user_id')
    .eq('org_id', orgId)
    .not('ghl_user_id', 'is', null)
  if (excludeUserId) query = query.neq('user_id', excludeUserId)

  const { data, error } = await query
  if (error) throw new Error(`dbGetLinkedGhlUserIds: ${error.message}`)
  return Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.ghl_user_id as string | null)
        .filter((v): v is string => !!v),
    ),
  )
}

/**
 * Define (ou limpa, com null) o ghl_user_id de um trainer já existente
 * identificado por (org_id, user_id). Retorna false se nenhuma linha foi
 * afetada (trainer inexistente nessa org).
 */
export async function dbSetTrainerGhlUserId(
  orgId: string,
  userId: string,
  ghlUserId: string | null,
): Promise<boolean> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .update({ ghl_user_id: ghlUserId, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .select('id')

  if (error) throw new Error(`dbSetTrainerGhlUserId: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Ativa/atualiza o "perfil de calls" de um OWNER: garante uma linha em
 * `trainers` para (org_id, user_id) — criando-a com owner_id apontando pro
 * próprio owner — e grava o ghl_user_id. Idempotente: se já existir, só
 * atualiza o ghl_user_id.
 *
 * Lança se o owner não tiver linha em `owners` nessa org (estado inválido).
 */
export async function dbUpsertOwnerCallProfile(
  orgId: string,
  userId: string,
  ghlUserId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // Já tem perfil? Só atualiza o ghl.
  const { data: existing, error: existErr } = await supabase
    .from('trainers')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existErr) throw new Error(`dbUpsertOwnerCallProfile(lookup): ${existErr.message}`)

  if (existing) {
    const { error } = await supabase
      .from('trainers')
      .update({ ghl_user_id: ghlUserId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(`dbUpsertOwnerCallProfile(update): ${error.message}`)
    return
  }

  // owner_id = a própria linha de owner do usuário nessa org.
  const { data: ownerRow, error: ownerErr } = await supabase
    .from('owners')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (ownerErr) throw new Error(`dbUpsertOwnerCallProfile(owner): ${ownerErr.message}`)
  if (!ownerRow) throw new Error('dbUpsertOwnerCallProfile: owner sem linha em owners nessa org')

  const { error } = await supabase.from('trainers').insert({
    user_id: userId,
    owner_id: ownerRow.id,
    org_id: orgId,
    ghl_user_id: ghlUserId,
  })
  if (error) throw new Error(`dbUpsertOwnerCallProfile(insert): ${error.message}`)
}

/**
 * Mapa user_id → ghl_user_id para os trainers de uma org (inclui o perfil de
 * calls de owners ativados). Usado pelo GET /api/invites para anexar o
 * vínculo GHL às linhas da tabela de membros.
 */
export async function dbGetMemberGhlUserIdsByOrg(
  orgId: string,
): Promise<Map<string, string | null>> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('user_id, ghl_user_id')
    .eq('org_id', orgId)
  if (error) throw new Error(`dbGetMemberGhlUserIdsByOrg: ${error.message}`)

  const map = new Map<string, string | null>()
  for (const r of data ?? []) {
    map.set(r.user_id as string, (r.ghl_user_id as string | null) ?? null)
  }
  return map
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
