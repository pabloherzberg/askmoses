import { getGeminiModel } from '@/lib/gemini'
import { runWithGeminiChain } from '@/lib/gemini-chain'
import { normaliseOutcome } from '@/lib/constants'
import type { Call, Trainer, BestCall, RubricScores } from '@/lib/types'
import type {
  BehavioralDimension,
  BehavioralTrendDimension,
  CoachingRec,
} from '@/lib/mock-data'

// Quando não há dado real (trainer sem call, IA fora do ar/quota), o Team
// Command Center cai num conteúdo mock pra a demo não ficar vazia. Cada
// trainer real é mapeado deterministicamente p/ uma das 4 personas mock —
// hash leve do id, mesmo resultado nas duas rotas (/api/coaching e
// /api/coaching/recommendations) p/ best/worst e recs baterem.
const PERSONA_KEYS = ['marcus', 'jamie', 'jordan', 'taylor'] as const
export type PersonaKey = (typeof PERSONA_KEYS)[number]
export function trainerPersona(trainerId: string): PersonaKey {
  let h = 0
  for (let i = 0; i < trainerId.length; i++) {
    h = ((h << 5) - h + trainerId.charCodeAt(i)) | 0
  }
  return PERSONA_KEYS[Math.abs(h) % PERSONA_KEYS.length]
}

// As 5 seções da rubrica — única fonte de dado "behavioral" com lastro real.
const SECTIONS: { key: keyof RubricScores; label: string }[] = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'problemAgitation', label: 'Problem Agitation' },
  { key: 'offerPresentation', label: 'Offer Presentation' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'closeAndNextSteps', label: 'Close & Next Steps' },
]

// Section scores chegam em escala mista (IA 0–5, seeds 0–100). Normaliza pra
// 0–100 — mesma heurística do syncTrainerStats.
function norm(v: number): number {
  return v > 5 ? v : v * 20
}

// ─── Trainer stats computed LIVE from the trainer's calls ────────────────────
// O cache em `trainers.*` (close_rate, score, score_discovery, …) só atualiza
// quando syncTrainerStats roda — tipicamente após /api/analyze. Calls inseridas
// por outros caminhos (seed, GHL pipeline, retry, sync que falhou silenciosa)
// deixam o cache zerado e a UI mostrando 0.0 mesmo com calls reais.
//
// Esta função recomputa SEMPRE a partir das calls em memória — mesma lógica
// do syncTrainerStats (closeRate por outcome='closed', score = avg, rubric
// por seção). Quando o trainer não tem calls, retorna o trainer original
// (sem alteração).
export function withLiveTrainerStats(
  trainer: Trainer,
  calls: Call[],
): Trainer {
  if (calls.length === 0) return trainer

  const total = calls.length
  const closed = calls.filter((c) => c.result === 'closed').length
  const closeRate = Math.round((closed / total) * 100)
  const score = Math.round(
    calls.reduce((s, c) => s + (c.score ?? 0), 0) / total,
  )

  // Rubric por seção: tenta primeiro o array `sections` (já em 0-100 do
  // banco); fallback pro objeto `rubricScores` parseado (mistura 0-5 / 0-100,
  // normalizado por `norm`). Idêntico à heurística do syncTrainerStats.
  const sectionByLabel: Record<string, { sum: number; count: number }> = {}
  for (const c of calls) {
    if (Array.isArray(c.sections) && c.sections.length > 0) {
      for (const s of c.sections) {
        const label = (s.name ?? '').toLowerCase().trim()
        if (!label) continue
        const v = norm(s.score ?? 0)
        if (v <= 0) continue
        if (!sectionByLabel[label]) sectionByLabel[label] = { sum: 0, count: 0 }
        sectionByLabel[label].sum += v
        sectionByLabel[label].count += 1
      }
    }
  }

  const rubricScores: RubricScores = { ...trainer.rubricScores }
  for (const { key, label } of SECTIONS) {
    const labelLower = label.toLowerCase()
    const bucket =
      sectionByLabel[labelLower] ??
      sectionByLabel[labelLower.replace(' & ', ' and ')] ??
      sectionByLabel[labelLower.replace(' and ', ' & ')]
    if (bucket && bucket.count > 0) {
      rubricScores[key] = Math.round(bucket.sum / bucket.count)
    }
  }

  return {
    ...trainer,
    totalCalls: Math.max(trainer.totalCalls ?? 0, total),
    closeRate,
    score,
    rubricScores,
  }
}

// ─── Behavioral Correlation Profile ──────────────────────────────────────────
// Por seção: nota do trainer vs. média do time (delta = trainer − time).
//
// Source of truth das DIMENSIONS: as sections do SCRIPT ATIVO da org. Isso
// garante que todo trainer é avaliado nas MESMAS dimensões (na ordem do
// script), independente de qual versão do script foi usada em cada call
// histórica. Vantagens:
//
//   - Consistência horizontal: a comparação trainer × time mostra exatamente
//     as mesmas linhas pra todos os trainers da org.
//   - Estabilidade: trocar o script ativo redefine as dimensions sem mexer
//     em código.
//   - Sem viés por antiguidade: trainer com 1 call antiga e outro com 5
//     calls recentes seguem o mesmo eixo.
//
// Score do trainer e teamAvg vêm das CALLS (sections[].name + score),
// agregando QUALQUER call cuja seção case com o nome do script ativo
// (case-insensitive). Calls feitas com scripts antigos cujas seções
// coincidem com as do ativo contribuem; as que não coincidem ficam fora
// — comportamento desejável (script mudou, métricas seguem o atual).
//
// Fallback (sem script ativo): deriva nomes da call mais recente do
// trainer com sections populadas. Último recurso: trainer.rubricScores
// cacheado com as 5 labels legadas.
export interface BehavioralProfileScript {
  sections: { name: string }[]
}

export function buildBehavioralProfile(
  trainer: Trainer,
  trainerCalls: Call[],
  allCalls: Call[],
  activeScript?: BehavioralProfileScript | null,
): BehavioralDimension[] {
  if ((trainer.totalCalls ?? 0) === 0) return []

  // 1) Preferência: script ativo da org define dimensões + ordem.
  let orderedNames: string[] = []
  if (activeScript && Array.isArray(activeScript.sections)) {
    orderedNames = activeScript.sections.map((s) => s.name).filter(Boolean)
  }

  // 2) Fallback: ordem da call mais recente do trainer com sections.
  if (orderedNames.length === 0) {
    const recentWithSections = [...trainerCalls]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .find((c) => Array.isArray(c.sections) && c.sections.length > 0)
    if (recentWithSections?.sections) {
      orderedNames = recentWithSections.sections.map((s) => s.name).filter(Boolean)
    }
  }

  // 3) Último recurso: rubric cacheado com 5 labels legadas. Preserva
  //    visualização pra dados pré-migration.
  if (orderedNames.length === 0) {
    const rubric = trainer.rubricScores
    const hasAnyCached =
      (rubric.discovery ?? 0) +
        (rubric.problemAgitation ?? 0) +
        (rubric.offerPresentation ?? 0) +
        (rubric.objectionHandling ?? 0) +
        (rubric.closeAndNextSteps ?? 0) >
      0
    if (!hasAnyCached) return []
    return SECTIONS.map(({ key, label }) => {
      const score = Math.round(rubric[key] ?? 0)
      return {
        dimension: label,
        score,
        delta: 0,
        teamAvg: score,
        source: 'Rubric' as const,
      }
    })
  }

  const avgForName = (calls: Call[], name: string): number => {
    const lower = name.toLowerCase()
    const vals: number[] = []
    for (const c of calls) {
      if (!Array.isArray(c.sections)) continue
      for (const s of c.sections) {
        if ((s.name ?? '').toLowerCase() !== lower) continue
        const v = norm(s.score ?? 0)
        if (v > 0) vals.push(v)
      }
    }
    if (vals.length === 0) return 0
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  return orderedNames.map((name) => {
    const score = avgForName(trainerCalls, name)
    const teamAvg = avgForName(allCalls, name)
    return {
      dimension: name,
      score,
      delta: score - teamAvg,
      teamAvg,
      source: 'Rubric' as const,
    }
  })
}

// ─── Behavioral Trends — 6 Weeks ─────────────────────────────────────────────
// Preservado para reuso futuro — atualmente sem render no Team Command Center.
// Por seção: média semanal nas semanas que TÊM calls (sem fabricar vazias).
export function buildBehavioralTrends(calls: Call[]): BehavioralTrendDimension[] {
  if (calls.length === 0) return []

  // 6 semanas (segunda → domingo), ancoradas em hoje.
  const now = new Date()
  const currentMonday = new Date(now)
  currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  currentMonday.setHours(0, 0, 0, 0)

  const weekBuckets: Call[][] = []
  for (let w = 5; w >= 0; w--) {
    const start = new Date(currentMonday)
    start.setDate(start.getDate() - w * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const wk = calls.filter((c) => {
      const ts = new Date(c.date).getTime()
      return ts >= start.getTime() && ts < end.getTime()
    })
    if (wk.length > 0) weekBuckets.push(wk)
  }
  if (weekBuckets.length === 0) return []

  const avgSection = (group: Call[], key: keyof RubricScores): number => {
    const vals = group.map((c) => norm(c.rubricScores[key] ?? 0)).filter((v) => v > 0)
    return vals.length > 0
      ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
      : 0
  }

  return SECTIONS.map(({ key, label }) => ({
    dimension: label,
    trend: weekBuckets.map((wk) => avgSection(wk, key)),
    currentScore: avgSection(calls, key),
  }))
}

// ─── Best / Needs Improvement calls ──────────────────────────────────────────
export function buildBestWorstCalls(
  calls: Call[],
): { best: BestCall[]; worst: BestCall[] } {
  if (calls.length === 0) return { best: [], worst: [] }

  // Emit raw values (ISO date + canonical outcome enum) so the client can
  // format/translate per locale. Legacy outcomes (e.g. `follow_up`) are
  // normalised here so the i18n `Shared.outcomes.short.<key>` lookup hits a
  // known key on the client.
  const toBestCall = (c: Call): BestCall => ({
    id: c.id,
    prospect: c.prospect,
    date: c.date,
    score: c.score,
    result: normaliseOutcome(c.result) ?? c.result,
    analysis: c.feedback || '—',
    listenAt: '',
    intentBreakdown: c.intentBreakdown,
  })

  const sorted = [...calls].sort((a, b) => b.score - a.score)
  const best = sorted.slice(0, 2).map(toBestCall)
  // Pior: 2 mais baixas, excluindo as que já estão em "best" (sem overlap).
  const worst = sorted.slice(2).slice(-2).reverse().map(toBestCall)
  return { best, worst }
}

// ─── AI Coaching Recommendations ─────────────────────────────────────────────
const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish',
  fr: 'French',
}

export async function generateCoachingRecs(
  trainerName: string,
  calls: Call[],
  locale: string,
): Promise<CoachingRec[]> {
  if (calls.length === 0) return []

  const firstName = trainerName.split(' ')[0]
  const recent = [...calls]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20)

  // Sinais AGREGADOS — o sales person não tem como rastrear uma call
  // individual ("Call 3"), então nada de identidade por call no prompt.
  const closed = recent.filter((c) => c.result === 'closed').length
  const closeRate = Math.round((closed / recent.length) * 100)
  const avgScore = Math.round(
    recent.reduce((s, c) => s + c.score, 0) / recent.length,
  )
  const strengths = recent.flatMap((c) => c.strengths).filter(Boolean)
  const improvements = recent.flatMap((c) => c.improvements).filter(Boolean)
  const sectionAvgs = SECTIONS.map(({ key, label }) => {
    const vals = recent
      .map((c) => norm(c.rubricScores[key] ?? 0))
      .filter((v) => v > 0)
    const avg =
      vals.length > 0
        ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
        : 0
    return `  - ${label}: ${avg}/100`
  }).join('\n')

  const prompt = `You are an expert sales coach for a dog-training business, coaching a sales rep named ${firstName}.

Aggregated view of ${firstName}'s recent ${recent.length} sales calls:
- Close rate: ${closeRate}%
- Average call score: ${avgScore}/100
- Average score by skill area:
${sectionAvgs}
- Strengths noted across calls: ${strengths.slice(0, 12).join('; ') || 'none noted'}
- Improvement areas noted across calls: ${improvements.slice(0, 12).join('; ') || 'none noted'}

Write exactly 3 coaching recommendations for ${firstName}.

Rules:
- Focus on BEHAVIOR, habits and concrete techniques ${firstName} can practice on upcoming calls.
- Do NOT reference specific calls, call numbers, prospect names or dates — ${firstName} cannot look those up. Talk about overall patterns only.
- Each recommendation must be actionable: something concrete to start, stop or change.
- Write in ${LOCALE_NAMES[locale] ?? 'English'}.

Return ONLY valid JSON (no markdown), with this exact shape:
{"recommendations":[{"title":"<short imperative, max 8 words>","text":"<1-2 sentences: the behavior to change and how>"}]}
Exactly 3 items.`.trim()

  // Model chain: flash-lite (default) → 2.0-flash → 2.0-flash-lite. On 429,
  // each model is cooled down for the provider-reported delay and the next is
  // tried. Cooldown state is shared with the translation pipeline.
  const parsed = await runWithGeminiChain<{
    recommendations?: { title?: string; text?: string }[]
  }>(async (modelName) => {
    const model = getGeminiModel(modelName)
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : cleaned)
  })

  if (!parsed) return []

  return (parsed.recommendations ?? [])
    .slice(0, 3)
    .filter((r): r is { title: string; text: string } => !!r.title && !!r.text)
    .map((r, i) => ({
      order: i + 1,
      title: r.title,
      text: r.text,
      cta: '',
      ctaKey: 'reference' as const,
    }))
}
