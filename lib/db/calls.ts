import { createAdminClient } from '@/lib/supabase/admin'

export interface DbCall {
  id: string
  rubric_id: string | null
  trainer_id: string | null
  trainer_name: string
  trainer_email: string | null
  transcript: string | null
  overall_score: number | null
  total_criteria: number | null
  criteria: Record<string, unknown> | null
  summary: string | null
  strengths: string[] | null
  improvements: string[] | null
  email_sent: boolean
  email_id: string | null
  created_at: string
  updated_at: string
  call_outcome: string | null
  client_name: string | null
  detected_outcome: string | null
}

export interface CreateCallInput {
  orgId?: string
  rubricId?: string
  trainerId?: string
  trainerName: string
  trainerEmail?: string
  transcript?: string
  overallScore?: number
  totalCriteria?: number
  criteria?: Record<string, unknown>
  summary?: string
  strengths?: string[]
  improvements?: string[]
  callOutcome?: string
  clientName?: string
  detectedOutcome?: string
}

export interface UpdateCallInput {
  rubricId?: string
  trainerName?: string
  trainerEmail?: string
  transcript?: string
  overallScore?: number
  totalCriteria?: number
  criteria?: Record<string, unknown>
  summary?: string
  strengths?: string[]
  improvements?: string[]
  emailSent?: boolean
  emailId?: string
  callOutcome?: string
  clientName?: string
  detectedOutcome?: string
}

export interface GetCallsFilters {
  orgId?: string
  trainerId?: string
  trainerName?: string
  callOutcome?: string
  rubricId?: string
  limit?: number
  offset?: number
}

export async function dbGetCalls(filters?: GetCallsFilters): Promise<DbCall[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.orgId) query = query.eq('org_id', filters.orgId)
  if (filters?.trainerId) query = query.eq('trainer_id', filters.trainerId)
  else if (filters?.trainerName) query = query.eq('trainer_name', filters.trainerName)
  if (filters?.callOutcome) query = query.eq('call_outcome', filters.callOutcome)
  if (filters?.rubricId) query = query.eq('rubric_id', filters.rubricId)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset && filters?.limit) {
    query = query.range(filters.offset, filters.offset + filters.limit - 1)
  }

  const { data, error } = await query

  if (error) throw new Error(`dbGetCalls: ${error.message}`)

  return (data ?? []) as DbCall[]
}

export interface GetCallByIdScope {
  orgId?: string
  trainerId?: string
}

export async function dbGetCallById(id: string, scope?: GetCallByIdScope): Promise<DbCall | null> {
  const supabase = createAdminClient()

  let query = supabase
    .from('calls')
    .select('*')
    .eq('id', id)

  if (scope?.orgId) query = query.eq('org_id', scope.orgId)
  if (scope?.trainerId) query = query.eq('trainer_id', scope.trainerId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetCallById: ${error.message}`)
  }

  return (data ?? null) as DbCall | null
}

export async function dbCreateCall(input: CreateCallInput): Promise<DbCall> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .insert({
      org_id: input.orgId ?? null,
      rubric_id: input.rubricId ?? null,
      trainer_id: input.trainerId ?? null,
      trainer_name: input.trainerName,
      trainer_email: input.trainerEmail ?? '',
      transcript: input.transcript ?? null,
      overall_score: input.overallScore ?? null,
      total_criteria: input.totalCriteria ?? null,
      criteria: input.criteria ?? null,
      summary: input.summary ?? null,
      strengths: input.strengths ?? null,
      improvements: input.improvements ?? null,
      call_outcome: input.callOutcome ?? null,
      client_name: input.clientName ?? null,
      detected_outcome: input.detectedOutcome ?? null,
      email_sent: false,
    })
    .select()
    .single()

  if (error) throw new Error(`dbCreateCall: ${error.message}`)

  return data as DbCall
}

export async function dbUpdateCall(id: string, input: UpdateCallInput): Promise<DbCall> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.rubricId !== undefined) patch.rubric_id = input.rubricId
  if (input.trainerName !== undefined) patch.trainer_name = input.trainerName
  if (input.trainerEmail !== undefined) patch.trainer_email = input.trainerEmail
  if (input.transcript !== undefined) patch.transcript = input.transcript
  if (input.overallScore !== undefined) patch.overall_score = input.overallScore
  if (input.totalCriteria !== undefined) patch.total_criteria = input.totalCriteria
  if (input.criteria !== undefined) patch.criteria = input.criteria
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.strengths !== undefined) patch.strengths = input.strengths
  if (input.improvements !== undefined) patch.improvements = input.improvements
  if (input.emailSent !== undefined) patch.email_sent = input.emailSent
  if (input.emailId !== undefined) patch.email_id = input.emailId
  if (input.callOutcome !== undefined) patch.call_outcome = input.callOutcome
  if (input.clientName !== undefined) patch.client_name = input.clientName
  if (input.detectedOutcome !== undefined) patch.detected_outcome = input.detectedOutcome

  const { data, error } = await supabase
    .from('calls')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`dbUpdateCall: ${error.message}`)

  return data as DbCall
}

export async function dbDeleteCall(id: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('calls')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`dbDeleteCall: ${error.message}`)
}
