import { createAdminClient } from "@/lib/supabase/admin";

export interface DbRubric {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  role_label: string;
  call_goal: string;
  coaching_boundaries: string | null;
  coaching_tone: "encouraging" | "direct" | "balanced";
  outcome_options: string[];
  system_prompt: string | null;
  llm_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCriterion {
  id: string;
  rubric_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

/** Returns the default (active) rubric for an org. Replaces dbGetActiveRubric (RB-06). */
export async function dbGetDefaultRubric(
  orgId: string,
): Promise<DbRubric | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("rubrics")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`dbGetDefaultRubric: ${error.message}`);
  }

  return data as DbRubric;
}


/** Lists all active rubrics for an org (RB-05). */
export async function dbGetRubrics(orgId: string): Promise<DbRubric[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("rubrics")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`dbGetRubrics: ${error.message}`);

  return (data ?? []) as DbRubric[];
}

export async function dbGetCriteriaByRubric(
  rubricId: string,
): Promise<DbCriterion[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("criteria")
    .select("*")
    .eq("rubric_id", rubricId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`dbGetCriteriaByRubric: ${error.message}`);

  return (data ?? []) as DbCriterion[];
}

export async function dbGetDefaultRubricWithCriteria(orgId: string): Promise<{
  rubric: DbRubric;
  criteria: DbCriterion[];
} | null> {
  const rubric = await dbGetDefaultRubric(orgId);
  if (!rubric) return null;

  const criteria = await dbGetCriteriaByRubric(rubric.id);
  return { rubric, criteria };
}


// ─── Input interfaces ────────────────────────────────────────────────────────

export interface CreateRubricInput {
  orgId: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  roleLabel?: string;
  callGoal?: string;
  coachingBoundaries?: string | null;
  coachingTone?: "encouraging" | "direct" | "balanced";
  outcomeOptions?: string[];
  systemPrompt?: string | null;
  llmModel?: string | null;
}

export interface UpdateRubricInput {
  name?: string;
  description?: string | null;
  roleLabel?: string;
  callGoal?: string;
  coachingBoundaries?: string | null;
  coachingTone?: "encouraging" | "direct" | "balanced";
  outcomeOptions?: string[];
  systemPrompt?: string | null;
  llmModel?: string | null;
}

export interface CreateCriterionInput {
  rubricId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
}

export interface UpdateCriterionInput {
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

// ─── Write operations ────────────────────────────────────────────────────────

/** Creates a new rubric for an org. Owner only (RB-09). */
export async function dbCreateRubric(
  input: CreateRubricInput,
): Promise<DbRubric> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("rubrics")
    .insert({
      org_id: input.orgId,
      name: input.name,
      description: input.description ?? null,
      is_default: input.isDefault ?? false,
      role_label: input.roleLabel ?? "trainer",
      call_goal: input.callGoal ?? "close deal",
      coaching_boundaries: input.coachingBoundaries ?? null,
      coaching_tone: input.coachingTone ?? "encouraging",
      outcome_options: input.outcomeOptions ?? [
        "closed",
        "not_closed",
        "partial",
        "no_outcome",
      ],
      system_prompt: input.systemPrompt ?? null,
      llm_model: input.llmModel ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`dbCreateRubric: ${error.message}`);
  return data as DbRubric;
}

/** Soft-deletes a rubric — never hard delete (DM-06, RB-08). */
export async function dbDeactivateRubric(id: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("rubrics")
    .update({
      is_active: false,
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`dbDeactivateRubric: ${error.message}`);
}

export async function dbUpdateRubric(
  id: string,
  input: UpdateRubricInput,
): Promise<DbRubric> {
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.roleLabel !== undefined) patch.role_label = input.roleLabel;
  if (input.callGoal !== undefined) patch.call_goal = input.callGoal;
  if (input.coachingBoundaries !== undefined)
    patch.coaching_boundaries = input.coachingBoundaries;
  if (input.coachingTone !== undefined)
    patch.coaching_tone = input.coachingTone;
  if (input.outcomeOptions !== undefined)
    patch.outcome_options = input.outcomeOptions;
  if (input.systemPrompt !== undefined)
    patch.system_prompt = input.systemPrompt;
  if (input.llmModel !== undefined) patch.llm_model = input.llmModel;

  const { data, error } = await supabase
    .from("rubrics")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`dbUpdateRubric: ${error.message}`);
  return data as DbRubric;
}

export async function dbCreateCriterion(
  input: CreateCriterionInput,
): Promise<DbCriterion> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("criteria")
    .insert({
      rubric_id: input.rubricId,
      name: input.name,
      description: input.description ?? null,
      sort_order: input.sortOrder,
    })
    .select()
    .single();

  if (error) throw new Error(`dbCreateCriterion: ${error.message}`);
  return data as DbCriterion;
}

export async function dbUpdateCriterion(
  id: string,
  input: UpdateCriterionInput,
): Promise<DbCriterion> {
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await supabase
    .from("criteria")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`dbUpdateCriterion: ${error.message}`);
  return data as DbCriterion;
}

export async function dbDeleteCriterion(id: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("criteria").delete().eq("id", id);

  if (error) throw new Error(`dbDeleteCriterion: ${error.message}`);
}

export async function dbBulkReplaceCriteria(
  rubricId: string,
  criteria: Omit<CreateCriterionInput, "rubricId">[],
): Promise<DbCriterion[]> {
  const supabase = createAdminClient();

  // Delete existing criteria
  const { error: delError } = await supabase
    .from("criteria")
    .delete()
    .eq("rubric_id", rubricId);

  if (delError)
    throw new Error(`dbBulkReplaceCriteria (delete): ${delError.message}`);

  // Insert new criteria
  const rows = criteria.map((c, i) => ({
    rubric_id: rubricId,
    name: c.name,
    description: c.description ?? null,
    sort_order: c.sortOrder ?? i,
  }));

  const { data, error: insError } = await supabase
    .from("criteria")
    .insert(rows)
    .select()
    .order("sort_order", { ascending: true });

  if (insError)
    throw new Error(`dbBulkReplaceCriteria (insert): ${insError.message}`);
  return (data ?? []) as DbCriterion[];
}
