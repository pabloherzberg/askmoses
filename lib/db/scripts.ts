import { createAdminClient } from '@/lib/supabase/admin'

export interface ScriptSection {
  name: string
  instructions: string
  tips: string
  /** Section weight (0–100). Sum across all sections of a script must equal
   *  100. Optional in the type for backwards compat with older scripts that
   *  predate weight tracking, but the script-builder UI requires it on save. */
  weight?: number
  /** Critical flag — score ≤ 4 on a critical section triggers red alert in
   *  the coaching email and adds the alert badge in CallDetail. Optional
   *  for back-compat. */
  critical?: boolean
}

export interface ScriptCriterion {
  name: string
  description: string
}

export interface DbScript {
  id: string
  rubric_id: string
  name: string
  description: string | null
  sections: ScriptSection[]
  full_script: string | null
  criteria: ScriptCriterion[]
  is_active: boolean
  created_at: string
  updated_at: string
  // Three-part versioning (migrations 044, 063). Opcionais para back-compat
  // com scripts criados antes do schema receber as colunas — backfill da
  // 063 garante owner_edit_version=0 em scripts existentes.
  rubric_version_snapshot?: number | null
  minor_version?: number | null
  owner_edit_version?: number | null
}

export interface CreateScriptInput {
  orgId?: string
  rubricId?: string
  name: string
  description?: string
  sections: ScriptSection[]
  full_script?: string
  criteria: ScriptCriterion[]
  isActive?: boolean
}

export interface UpdateScriptInput {
  name?: string
  description?: string
  sections?: ScriptSection[]
  full_script?: string
  criteria?: ScriptCriterion[]
  isActive?: boolean
}

export async function dbGetScripts(filters?: {
  orgId?: string | null  // null = scripts globais (admin), undefined = sem filtro
  rubricId?: string
  active?: boolean
}): Promise<DbScript[]> {
  const supabase = createAdminClient()

  // Active scripts surface first so the upload-page dropdown highlights the
  // one the org currently treats as default; archived ones still appear so
  // they can be re-used for re-analysis if needed.
  let query = supabase
    .from('scripts')
    .select('*')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters?.orgId !== undefined) {
    if (filters.orgId === null) query = query.is('org_id', null)
    else query = query.eq('org_id', filters.orgId)
  }
  if (filters?.rubricId) query = query.eq('rubric_id', filters.rubricId)
  if (filters?.active !== undefined) query = query.eq('is_active', filters.active)

  const { data, error } = await query

  if (error) throw new Error(`dbGetScripts: ${error.message}`)

  return (data ?? []) as DbScript[]
}

/**
 * Resolve o script ATIVO da org. Mesma lógica usada por /api/scripts/active
 * e pela lista /me/calls (CallsTable.activeScript): tenta primeiro
 * `org_scripts` (mecanismo novo via send/accept do Admin), e se a org não
 * tem essa linha cai pro fallback legado `scripts.is_active=true` filtrado
 * por org_id.
 *
 * Ordem de preferência:
 *   1. org_scripts.status='active' AND ended_at IS NULL  (partial unique →
 *      no máx. 1 row, ver migration 059).
 *   2. scripts.org_id=<orgId> AND is_active=true ORDER BY created_at DESC
 *      LIMIT 1 — fallback pra orgs que ainda não passaram pelo fluxo
 *      send/accept (legado / pré-migration 044).
 *
 * Retorna null só quando a org não tem script ativo em NENHUM dos dois
 * mecanismos — nesse caso /api/analyze barra com 400 e direciona ao suporte.
 */
export async function dbGetActiveOrgScript(orgId: string): Promise<DbScript | null> {
  const supabase = createAdminClient()

  // ─── 1) Tenta org_scripts (fonte canônica desde migration 044) ──────────
  // Desambigua a FK: org_scripts tem DUAS refs pra scripts (script_id na 044
  // e previous_script_id na 051). PostgREST não sabe escolher sem o hint —
  // `scripts!script_id(*)` força a relação via coluna script_id.
  const { data, error } = await supabase
    .from('org_scripts')
    .select('scripts!script_id(*)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .is('ended_at', null)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`dbGetActiveOrgScript: ${error.message}`)
  }

  // Em algumas versões do PostgREST o embed vem como objeto único, em outras
  // como array de 1 elemento — normalizamos defensivamente.
  const embedded = (data as unknown as { scripts: DbScript | DbScript[] | null } | null)?.scripts
  const fromOrgScripts = embedded
    ? (Array.isArray(embedded) ? (embedded[0] ?? null) : embedded)
    : null
  if (fromOrgScripts) return fromOrgScripts

  // ─── 2) Fallback legado: scripts.org_id=X AND is_active=true ────────────
  // É o mesmo mecanismo que `/me/calls` usa pra marcar a pill de active
  // (CallsTable.scriptIsActive vem de scripts.is_active). Sem esse fallback,
  // orgs que nunca rodaram o fluxo send/accept ficam com /api/analyze
  // bloqueada mesmo tendo um script local marcado como ativo.
  const { data: legacy, error: legacyErr } = await supabase
    .from('scripts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (legacyErr && legacyErr.code !== 'PGRST116') {
    throw new Error(`dbGetActiveOrgScript (legacy fallback): ${legacyErr.message}`)
  }

  return (legacy as DbScript | null) ?? null
}

/**
 * Fetch a script by id. Pass `orgId` to enforce tenant isolation — required
 * defense-in-depth because dbCreateAdminClient bypasses RLS. Calling this
 * without `orgId` is a security bug; the parameter is required for that
 * reason (only internal scripts/seed code should ever opt-out by passing
 * an empty string explicitly).
 */
export async function dbGetScriptById(id: string, orgId: string): Promise<DbScript | null> {
  const supabase = createAdminClient()

  let query = supabase.from('scripts').select('*').eq('id', id)
  if (orgId) query = query.eq('org_id', orgId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`dbGetScriptById: ${error.message}`)
  }

  return (data ?? null) as DbScript | null
}

export async function dbCreateScript(input: CreateScriptInput): Promise<DbScript> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('scripts')
    .insert({
      org_id: input.orgId ?? null,
      rubric_id: input.rubricId ?? null,
      name: input.name,
      description: input.description ?? null,
      sections: input.sections,
      full_script: input.full_script ?? null,
      criteria: input.criteria,
      is_active: input.isActive ?? true,
    })
    .select()
    .single()

  if (error) throw new Error(`dbCreateScript: ${error.message}`)

  return data as DbScript
}

export async function dbUpdateScript(id: string, input: UpdateScriptInput): Promise<DbScript> {
  const supabase = createAdminClient()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.sections !== undefined) patch.sections = input.sections
  if (input.full_script !== undefined) patch.full_script = input.full_script
  if (input.criteria !== undefined) patch.criteria = input.criteria
  if (input.isActive !== undefined) patch.is_active = input.isActive

  const { data, error } = await supabase
    .from('scripts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`dbUpdateScript: ${error.message}`)

  return data as DbScript
}

export async function dbDeleteScript(id: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('scripts')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`dbDeleteScript: ${error.message}`)
}
