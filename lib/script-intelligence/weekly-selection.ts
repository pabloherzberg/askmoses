// Seleção das calls da sugestão semanal de script (cron semanal).
//
// Regras (decisão de 30/09/2026):
//   - call fechada (call_outcome='closed') E lead que virou cliente no GHL
//     (ghl_won_status='won') — NÃO usa Stage 2;
//   - score válido (overall_score presente, scoring_status fora de
//     scoring_failed/transcript_leaked) e transcrição com mais de 100
//     caracteres, dos últimos 90 dias (filtros na query, ver
//     fetchWeeklyCandidateCalls em weekly-suggestion.ts);
//   - DIVERSIDADE: exatamente 3 calls por org, as 3 de maior score. Org com
//     menos de 3 fica de fora da rodada, com o motivo registrado — o cron não
//     aborta por isso;
//   - org is_demo nunca entra.
//
// Função pura para ser testada sem banco.

export const WEEKLY_CALLS_PER_ORG = 3
export const WEEKLY_WINDOW_DAYS = 90
export const WEEKLY_MIN_TRANSCRIPT_LENGTH = 100

export interface WeeklyOrg {
  id: string
  name: string
  is_demo: boolean
}

export interface WeeklyCandidateCall {
  id: string
  org_id: string | null
  overall_score: number
  transcript: string | null
  created_at: string
}

export interface WeeklyIncludedOrg {
  orgId: string
  orgName: string
  calls: { id: string; overallScore: number; transcript: string }[]
}

export interface WeeklySkippedOrg {
  orgId: string
  orgName: string
  eligibleCalls: number
  reason: string
}

export interface WeeklySelection {
  included: WeeklyIncludedOrg[]
  skipped: WeeklySkippedOrg[]
}

export function selectWeeklyCalls(
  orgs: WeeklyOrg[],
  candidates: WeeklyCandidateCall[],
  perOrg: number = WEEKLY_CALLS_PER_ORG,
): WeeklySelection {
  // Segunda barreira de transcrição: a query já filtra NULL, mas o tamanho
  // mínimo não dá pra filtrar no PostgREST.
  const byOrg = new Map<string, WeeklyCandidateCall[]>()
  for (const c of candidates) {
    if (!c.org_id) continue
    if (!c.transcript || c.transcript.length <= WEEKLY_MIN_TRANSCRIPT_LENGTH) continue
    const list = byOrg.get(c.org_id) ?? []
    list.push(c)
    byOrg.set(c.org_id, list)
  }

  const included: WeeklyIncludedOrg[] = []
  const skipped: WeeklySkippedOrg[] = []

  // Ordem estável por nome — a ordem das orgs no prompt e no registro não
  // depende da ordem em que o banco devolveu as linhas.
  const sortedOrgs = [...orgs].sort((a, b) => a.name.localeCompare(b.name))

  for (const org of sortedOrgs) {
    const eligible = byOrg.get(org.id) ?? []

    if (org.is_demo) {
      skipped.push({
        orgId: org.id,
        orgName: org.name,
        eligibleCalls: eligible.length,
        reason: 'Org de demonstração/teste (is_demo)',
      })
      continue
    }

    if (eligible.length < perOrg) {
      skipped.push({
        orgId: org.id,
        orgName: org.name,
        eligibleCalls: eligible.length,
        reason: `${eligible.length} call(s) elegível(is) nos últimos ${WEEKLY_WINDOW_DAYS} dias (mínimo ${perOrg})`,
      })
      continue
    }

    // As `perOrg` de maior score; empate → mais recente, depois id (determinístico).
    const top = [...eligible]
      .sort(
        (a, b) =>
          b.overall_score - a.overall_score ||
          b.created_at.localeCompare(a.created_at) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, perOrg)

    included.push({
      orgId: org.id,
      orgName: org.name,
      calls: top.map((c) => ({
        id: c.id,
        overallScore: c.overall_score,
        transcript: c.transcript as string,
      })),
    })
  }

  return { included, skipped }
}
