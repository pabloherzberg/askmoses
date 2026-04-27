/**
 * lib/db — Camada de acesso ao banco de dados (Supabase).
 *
 * Cada módulo exporta funções `db*` que fazem queries diretas via service role.
 * Os serviços em lib/services/ consomem essa camada em produção e
 * usam lib/mock-data.ts em desenvolvimento.
 *
 * Estrutura:
 *   lib/db/calls.ts     → dbGetCalls, dbGetCallById
 *   lib/db/trainers.ts  → dbGetTrainers, dbGetTrainerById
 *   lib/db/clients.ts   → dbGetClients, dbGetGlobalMetrics
 *   lib/db/plans.ts     → dbGetPlans, dbGetPlanById, dbGetPlanByCode
 *   lib/db/rubric.ts    → dbGetRubricSections, dbGetTrendData, dbGetRubricConfig
 *   lib/db/insights.ts  → dbGetInsights, dbSaveInsights
 *   lib/db/scripts.ts   → dbGetScripts, dbCreateScript, dbUpdateScript, dbDeleteScript
 */

export * from './calls'
export * from './trainers'
export * from './clients'
export * from './plans'
export * from './rubric'
export * from './insights'
export * from './scripts'
