import { dbGetCalls, dbGetCallById, dbCreateCall, dbUpdateCall, dbDeleteCall } from '@/lib/db/calls'
import { normaliseOutcome } from '@/lib/constants'
import type { Call, RubricScores } from '@/lib/types'
import type { DbCall, CreateCallInput, UpdateCallInput, GetCallsFilters } from '@/lib/db/calls'

export type { CreateCallInput, UpdateCallInput, GetCallsFilters }

// ─── Criteria parser: JSONB array → RubricScores (0–100) ─────────────────────

const CRITERIA_NAME_MAP: Record<string, keyof RubricScores> = {
  'discovery': 'discovery',
  'problem agitation': 'problemAgitation',
  'offer presentation': 'offerPresentation',
  'objection handling': 'objectionHandling',
  'close & next steps': 'closeAndNextSteps',
  'close and next steps': 'closeAndNextSteps',
}

function parseCriteria(criteria: unknown): RubricScores {
  const defaults: RubricScores = {
    discovery: 0,
    problemAgitation: 0,
    offerPresentation: 0,
    objectionHandling: 0,
    closeAndNextSteps: 0,
  }
  if (!Array.isArray(criteria)) return defaults

  type Item = { criterionName?: string; name?: string; score?: number }
  const result = { ...defaults }
  for (const item of criteria as Item[]) {
    const rawName = (item.criterionName ?? item.name ?? '').toLowerCase().trim()
    const key = CRITERIA_NAME_MAP[rawName]
    if (key) result[key] = Math.round((item.score ?? 0) * 10) / 10  // keep 0–5 with 1 decimal
  }
  return result
}

// ─── Mapper DbCall → Call ─────────────────────────────────────────────────────

function toCall(db: DbCall): Call {
  return {
    id: db.id,
    trainerId: db.trainer_id ?? '',
    trainerName: db.trainer_name,
    date: db.created_at,
    duration: '—',
    score: db.overall_score ?? 0,
    result: normaliseOutcome(db.call_outcome ?? 'no_decision'),
    prospect: db.client_name ?? '—',
    rubricScores: parseCriteria(db.criteria),
    feedback: db.summary ?? '',
    strengths: db.strengths ?? [],
    improvements: db.improvements ?? [],
    transcript: db.transcript ?? '',
  }
}

// ─── Rubric averages helper ───────────────────────────────────────────────────

export function avgRubricScores(calls: Call[]): RubricScores {
  const keys: (keyof RubricScores)[] = [
    'discovery', 'problemAgitation', 'offerPresentation',
    'objectionHandling', 'closeAndNextSteps',
  ]
  const defaults: RubricScores = { discovery: 0, problemAgitation: 0, offerPresentation: 0, objectionHandling: 0, closeAndNextSteps: 0 }
  if (calls.length === 0) return defaults
  const result = { ...defaults }
  for (const key of keys) {
    result[key] = Math.round(calls.reduce((s, c) => s + c.rubricScores[key], 0) / calls.length)
  }
  return result
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCalls(filters?: GetCallsFilters): Promise<Call[]> {
  const rows = await dbGetCalls({
    trainerId: filters?.trainerId,
    trainerName: filters?.trainerName,
    callOutcome: filters?.callOutcome,
    rubricId: filters?.rubricId,
    limit: filters?.limit,
    offset: filters?.offset,
  })
  return rows.map(toCall)
}

export async function getCallById(id: string): Promise<Call | null> {
  const row = await dbGetCallById(id)
  return row ? toCall(row) : null
}

export async function createCall(input: CreateCallInput): Promise<DbCall> {
  return dbCreateCall(input)
}

export async function updateCall(id: string, input: UpdateCallInput): Promise<DbCall> {
  return dbUpdateCall(id, input)
}

export async function deleteCall(id: string): Promise<void> {
  return dbDeleteCall(id)
}
