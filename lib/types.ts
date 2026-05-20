export type Role = 'trainer' | 'owner' | 'admin'
export type CallResult = 'closed' | 'not_closed' | 'partial' | 'no_outcome'
export type LeadSource = 'facebook' | 'google' | 'organic' | 'referral' | 'other'
export type HealthStatus = 'healthy' | 'at-risk' | 'churning'
export type AvatarColor = 'blue' | 'purple' | 'green' | 'red' | 'amber'
export type TagColor = 'red' | 'amber' | 'blue' | 'green'
export type RubricColor = 'blue' | 'amber' | 'green' | 'red' | 'accent2'
export type InviteStatus = 'pending' | 'accepted'
export type OtpType = 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'signup'

const OTP_TYPES: ReadonlySet<OtpType> = new Set(['invite', 'magiclink', 'recovery', 'email_change', 'signup'])

export function isValidOtpType(value: string | null | undefined): value is OtpType {
  return typeof value === 'string' && OTP_TYPES.has(value as OtpType)
}

export interface RubricScores {
  discovery: number
  problemAgitation: number
  offerPresentation: number
  objectionHandling: number
  closeAndNextSteps: number
}

export interface Trainer {
  id: string
  name: string
  email?: string
  avatar: string
  avatarColor: AvatarColor
  role: Role
  totalCalls: number
  callsThisWeek?: number
  closeRate: number
  closeDelta: number
  score: number
  scoreDelta: number
  lastActive: string
  ownerId: string
  orgId?: string
  rubricScores: RubricScores
}

export interface CallSection {
  name: string
  score: number  // 1–5 (Prompt v2)
  feedback: string
  critical: boolean
  /** Section weight (0–100) from rubric_criteria.weight. Sum across the
   *  rubric should equal 100. Null when running with a script (script
   *  sections don't carry weight) or against a rubric without the
   *  weight column applied. */
  weight?: number | null
}

export interface Call {
  id: string
  trainerId: string
  trainerName: string
  date: string
  duration: string
  score: number
  result: CallResult
  prospect: string
  lead_name?: string | null
  lead_source?: LeadSource | null
  rubricScores: RubricScores
  sections?: CallSection[]
  feedback: string
  strengths: string[]
  improvements: string[]
  transcript: string
  orgId?: string
}

export interface TrainerScore {
  marcus: number
  jamie: number
  jordan: number
  taylor: number
}

export interface RubricSection {
  id: keyof RubricScores
  name: string
  weight: number
  isCritical: boolean
  description: string
  teamAvg: number
  color: RubricColor
  trainerScores: TrainerScore
}

export interface Insight {
  id: string
  type: 'risk' | 'warning' | 'tip' | 'positive'
  icon: string
  title: string
  tag: string
  tagColor: TagColor
  summary: string
  action: string
}

export type PlanCode = 'starter' | 'pro' | 'pro_rag'

export interface Plan {
  id: string
  code: PlanCode
  name: string
  priceCents: number
  timelineWeeks: number
  hasRag: boolean
  hasTwilio: boolean
  hasManualUpload: boolean
  maxSalesPeople: number | null
  features: string[]
}

// Status efetivo do script associado a uma org. 'none' = org nunca recebeu
// script via Admin. 'deprecated' é derivado: status='active' + existe script
// mais novo na mesma rubric (ver view org_scripts_current na migration 044).
export type OrgScriptStatus = 'none' | 'pending' | 'active' | 'deprecated' | 'rejected'

export interface OrgScriptInfo {
  scriptId: string
  scriptName: string
  version: string // ex: "1.2", "2.0"
  // Quando status='pending' e havia um script anterior aceito, populamos o
  // previousVersion pra UI poder mostrar "v2.0 → v2.1". Null em outros casos.
  previousVersion: string | null
  status: OrgScriptStatus
  startedAt: string | null
}

export interface Client {
  id: string
  name: string
  planId: string
  plan: Plan
  orgId: string
  callsThisMonth: number
  avgScore: number
  mrr: number
  health: HealthStatus
  trainersCount: number
  // false = nenhuma membership com role='owner' e invite_status='accepted'
  // existe ainda. Painel Admin renderiza chip "Aguardando Owner" ao lado do
  // nome, mesmo com subscription_status='active' (Admin já vendeu mas Owner
  // não clicou no magic link).
  ownerAccepted: boolean
  subscriptionStatus: 'active' | 'inactive' | 'trial'
  // Script ativo associado à org (mais recente em org_scripts via started_at
  // desc, ended_at IS NULL). null quando a org nunca recebeu script.
  currentScript: OrgScriptInfo | null
  // ISO timestamp da última atividade na org (max(calls.created_at)).
  // Usado na coluna Last Activity da tabela admin. null se nunca teve calls
  // — cai pra organizations.created_at no caller.
  lastCallAt: string | null
  createdAt: string
}

export interface TrendPoint {
  week: string
  closeRate: number
  score: number
}

export interface GlobalMetrics {
  totalClients: number
  totalCallsThisMonth: number
  totalMRR: number
  avgScore: number
}

export type CorrelationLevel = 'High' | 'Med' | 'Low'
export type CorrelationSource = 'Rubric' | 'Behavioral'

export interface CorrelationFactor {
  label: string
  score: number
  correlation: CorrelationLevel
  impact: CorrelationLevel
  source: CorrelationSource
}

export interface RubricGap {
  frequency: number
  description: string
}

export interface BestCall {
  prospect: string
  date: string
  score: number
  result: string
  analysis: string
  listenAt: string
  trainerInitials?: string
  trainerName?: string
  trainerColor?: string
}

export type CallsByTrainerMap = Record<string, BestCall[]>

export interface PerformanceTrendPoint {
  week: string
  closeRate: number
  avgScore: number
}

export interface RevenueEstimatorItem {
  section: string
  current: number
  target: number
  monthlyImpact: number
  confidence: CorrelationLevel
}

export type MarketingCopyType = 'headline' | 'primary-text'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface MarketingCopySuggestion {
  id: string
  type: MarketingCopyType
  text: string
  confidence: number
  basis: string
  confidenceLevel: ConfidenceLevel
}

export interface MarketingSourceCall {
  id: string
  name: string
  duration: string
  score: number
}

export interface MarketingIntelligence {
  lastRun: string
  nextRun: string
  sampleSize: number
  headlines: MarketingCopySuggestion[]
  primaryTexts: MarketingCopySuggestion[]
  sourceCalls: MarketingSourceCall[]
}

export type AiModuleId = 'scoring_engine' | 'correlation_engine' | 'marketing_intelligence'

export interface AiModuleConfig {
  module_id: AiModuleId
  temperature: number
  max_tokens: number
  updated_by: string
  updated_at: string
}

export interface AiModuleConfigLogEntry {
  id: string
  module_id: AiModuleId
  field: 'temperature' | 'max_tokens'
  previous_value: number
  new_value: number
  updated_by: string
  updated_at: string
}
