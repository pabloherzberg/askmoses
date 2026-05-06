import {
  dbGetCalls,
  dbGetCallById,
  dbCreateCall,
  dbUpdateCall,
  dbDeleteCall,
} from "@/lib/db/calls";
import { getOrgId } from "@/lib/auth";
import { normaliseOutcome } from "@/lib/constants";
import { translateCall, translateCalls } from "@/lib/i18n/translate-coaching";
import type { Locale } from "@/i18n/routing";
import type { Call, CallSection, RubricScores } from "@/lib/types";
import type {
  DbCall,
  CreateCallInput,
  UpdateCallInput,
  GetCallsFilters,
  GetCallByIdScope,
  CallMutationScope,
} from "@/lib/db/calls";

export type {
  CreateCallInput,
  UpdateCallInput,
  GetCallsFilters,
  GetCallByIdScope,
  CallMutationScope,
};

// ─── Criteria parser: JSONB array → RubricScores (0–100) ─────────────────────

const CRITERIA_NAME_MAP: Record<string, keyof RubricScores> = {
  discovery: "discovery",
  "problem agitation": "problemAgitation",
  "offer presentation": "offerPresentation",
  "objection handling": "objectionHandling",
  "close & next steps": "closeAndNextSteps",
  "close and next steps": "closeAndNextSteps",
};

function parseCriteria(criteria: unknown): RubricScores {
  const defaults: RubricScores = {
    discovery: 0,
    problemAgitation: 0,
    offerPresentation: 0,
    objectionHandling: 0,
    closeAndNextSteps: 0,
  };
  if (!Array.isArray(criteria)) return defaults;

  type Item = { criterionName?: string; name?: string; score?: number };
  const result = { ...defaults };
  for (const item of criteria as Item[]) {
    const rawName = (item.criterionName ?? item.name ?? "")
      .toLowerCase()
      .trim();
    const key = CRITERIA_NAME_MAP[rawName];
    if (key) {
      const raw = item.score ?? 0;
      const normalised = raw > 5 ? raw / 20 : raw;
      result[key] = Math.round(normalised * 10) / 10;
    }
  }
  return result;
}

// ─── Mapper DbCall → Call ─────────────────────────────────────────────────────

function parseSections(raw: unknown): CallSection[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed: CallSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const name = typeof s.name === "string" ? s.name : null;
    const score = typeof s.score === "number" ? s.score : Number(s.score);
    if (!name || !Number.isFinite(score)) continue;
    parsed.push({
      name,
      score,
      feedback: typeof s.feedback === "string" ? s.feedback : "",
      critical: typeof s.critical === "boolean" ? s.critical : false,
      // Weight (0–100) from rubric_criteria. Null on script flow or
      // pre-migration calls. Forwarded as-is to downstream consumers
      // (email template, analytics).
      weight: typeof s.weight === "number" ? s.weight : null,
    });
  }
  if (parsed.length === 0) return undefined;

  return parsed;
}

function toCall(db: DbCall): Call {
  return {
    id: db.id,
    trainerId: db.trainer_id ?? "",
    trainerName: db.trainer_name,
    date: db.created_at,
    duration: "—",
    score: (() => { const s = db.overall_score ?? 0; return Math.round((s > 5 ? s / 20 : s) * 10) / 10; })(),
    result: normaliseOutcome(db.call_outcome ?? "no_outcome") ?? "no_outcome",
    prospect: db.client_name ?? "—",
    rubricScores: parseCriteria(db.criteria),
    // sections (Prompt v2) preserves the rubric/script section names exactly.
    // CallDetail prefers this over the legacy hardcoded rubricScores fallback.
    sections: parseSections(db.sections),
    feedback: db.summary ?? "",
    strengths: db.strengths ?? [],
    improvements: db.improvements ?? [],
    transcript: db.transcript ?? "",
  };
}

// ─── Rubric averages helper ───────────────────────────────────────────────────

export function avgRubricScores(calls: Call[]): RubricScores {
  const keys: (keyof RubricScores)[] = [
    "discovery",
    "problemAgitation",
    "offerPresentation",
    "objectionHandling",
    "closeAndNextSteps",
  ];
  const defaults: RubricScores = {
    discovery: 0,
    problemAgitation: 0,
    offerPresentation: 0,
    objectionHandling: 0,
    closeAndNextSteps: 0,
  };
  if (calls.length === 0) return defaults;
  const result = { ...defaults };
  for (const key of keys) {
    result[key] = Math.round(
      (calls.reduce((s, c) => s + c.rubricScores[key], 0) / calls.length) * 10,
    ) / 10;
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCalls(
  filters?: GetCallsFilters & { locale?: Locale },
): Promise<Call[]> {
  const orgId = filters?.orgId ?? (await getOrgId());
  if (!orgId) return [];

  const rows = await dbGetCalls({
    orgId,
    trainerId: filters?.trainerId,
    trainerName: filters?.trainerName,
    // Normalise outcome filter: legacy aliases (follow_up, no_decision...) viram
    // canônicos. Valores desconhecidos viram undefined → sem filtro (em vez de
    // jogar lixo no Supabase e estourar 500 com erro de cast no ENUM).
    callOutcome: filters?.callOutcome
      ? (normaliseOutcome(filters.callOutcome) ?? undefined)
      : undefined,
    rubricId: filters?.rubricId,
    limit: filters?.limit,
    offset: filters?.offset,
  });
  const calls = rows.map(toCall);
  return filters?.locale ? translateCalls(calls, filters.locale) : calls;
}

export async function getCallById(
  id: string,
  opts?: { locale?: Locale; orgId?: string; trainerId?: string },
): Promise<Call | null> {
  const row = await dbGetCallById(id, {
    orgId: opts?.orgId,
    trainerId: opts?.trainerId,
  });
  if (!row) return null;
  const call = toCall(row);
  return opts?.locale ? translateCall(call, opts.locale) : call;
}

export async function createCall(input: CreateCallInput): Promise<DbCall> {
  return dbCreateCall(input);
}

export async function updateCall(
  id: string,
  input: UpdateCallInput,
  scope?: CallMutationScope,
): Promise<DbCall | null> {
  return dbUpdateCall(id, input, scope);
}

export async function deleteCall(
  id: string,
  scope?: CallMutationScope,
): Promise<boolean> {
  return dbDeleteCall(id, scope);
}
