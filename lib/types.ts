export type Role = "trainer" | "owner" | "admin";
export type CallResult = "closed" | "not_closed" | "partial" | "no_outcome";
export type LeadSource =
  | "facebook"
  | "google"
  | "organic"
  | "referral"
  | "other";
export type HealthStatus = "healthy" | "at-risk" | "churning";
export type AvatarColor = "blue" | "purple" | "green" | "red" | "amber";
export type TagColor = "red" | "amber" | "blue" | "green";
export type RubricColor = "blue" | "amber" | "green" | "red" | "accent2";
export type InviteStatus = "pending" | "accepted";
// Nota de intenção de compra, escala 0–5 COM decimais — derivada do
// intentBreakdown via computeIntentIndex (fonte da verdade). Não arredondar para
// inteiro. O fallback por resultado/IA (sem breakdown) usa valores inteiros.
export type IntentScore = number;
export type OtpType =
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "signup";

const OTP_TYPES: ReadonlySet<OtpType> = new Set([
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "signup",
]);

export function isValidOtpType(
  value: string | null | undefined,
): value is OtpType {
  return typeof value === "string" && OTP_TYPES.has(value as OtpType);
}

export interface RubricScores {
  discovery: number;
  problemAgitation: number;
  offerPresentation: number;
  objectionHandling: number;
  closeAndNextSteps: number;
}

export interface Trainer {
  id: string;
  name: string;
  email?: string;
  avatar: string;
  avatarColor: AvatarColor;
  role: Role;
  totalCalls: number;
  callsThisWeek?: number;
  closeRate: number;
  closeDelta: number;
  score: number;
  scoreDelta: number;
  lastActive: string;
  lastActiveAt?: string | null;
  ownerId: string;
  orgId?: string;
  rubricScores: RubricScores;
}

export interface CallSection {
  name: string;
  score: number; // 1–5 (Prompt v2)
  feedback: string;
  critical: boolean;
  weight?: number | null;
}

export interface Call {
  id: string;
  // Nullable: calls vindas do pipeline GHL podem não ter trainer resolvido.
  // Consumidores (rubric, insights, coaching, CallsTable) já guardam com
  // `if (!call.trainerId)`.
  trainerId: string | null;
  trainerName: string;
  date: string;
  durationSeconds: number | null;
  score: number;
  result: CallResult;
  intent: IntentScore;
  prospect: string;
  lead_name?: string | null;
  lead_source?: LeadSource | null;
  rubricScores: RubricScores;
  sections?: CallSection[];
  feedback: string;
  strengths: string[];
  improvements: string[];
  transcript: string;
  orgId?: string;
  // Script usado na análise da call (migration 056). `scriptId` vem do DB;
  // `scriptName`/`scriptIsActive`/`scriptVersion` são resolvidos pela página
  // /calls a partir da lista de scripts da org. Todos opcionais — calls sem
  // script (rubric) ou consumidores que não enriquecem deixam undefined.
  scriptId?: string | null;
  scriptName?: string | null;
  scriptIsActive?: boolean;
  // Formato "v{rubric}.{minor}.{owner_edit}" (migration 063). Null quando o
  // script é anterior ao versionamento ou não tem as 3 colunas populadas.
  scriptVersion?: string | null;
  // Phase 3: Intent scores calculated by IA (4 signals: financial, urgency, authority, engagement)
  // Mapped from intent_breakdown (DB snake_case) to intentBreakdown (TS camelCase)
  intentBreakdown?: Record<string, number>;
  // Intent weights snapshot at time of analysis
  // Mapped from intent_weights (DB) to intentWeights (TS camelCase)
  intentWeights?: Record<string, number>;
  // Status do pipeline GHL (transcription_failed, no_recording, etc.)
  processingStatus?: string | null;
  // GHL contactId (migration 091) — junta a call ao lead/appointment.
  contactId?: string | null;
  // Stage 2 — Actual Close (migration 092). result/call_outcome é o Stage 1
  // (Initial Result); estes campos são o paying client, momento separado.
  stage2Outcome?: 'paying' | 'not_paying' | 'pending' | null;
  becamePayingAt?: string | null;
  intentAtClose?: number | null;
  // GHL Opportunity (migration 096)
  ghlOpportunityId?: string | null;
  ghlWonStatus?: string | null;
  ghlWonAt?: string | null;
  // Data em que a call de fato aconteceu (migration 036), distinta de `date`
  // (created_at = upload/ingestão). Usada como "data da eval" no Intent dashboard.
  callDate?: string | null;
  // Origem da data da eval: 'ghl' quando ingest_source é webhook (confiável),
  // 'llm' quando veio de upload manual (call_date é estimado/extraído do
  // transcript) — sinalizado na UI como fallback.
  evalDateSource?: "ghl" | "llm";
}

export interface TrainerScore {
  marcus: number;
  jamie: number;
  jordan: number;
  taylor: number;
}

export interface RubricSection {
  id: keyof RubricScores;
  name: string;
  weight: number;
  isCritical: boolean;
  description: string;
  teamAvg: number;
  color: RubricColor;
  trainerScores: TrainerScore;
}

export interface Insight {
  id: string;
  type: "risk" | "warning" | "tip" | "positive";
  icon: string;
  title: string;
  tag: string;
  tagColor: TagColor;
  summary: string;
  action: string;
}

export interface ScriptGap {
  id: string;
  section: string; // ex: "Objection Handling"
  scriptInstruction: string; // o que o script instrui o vendedor a fazer
  observedPattern: string; // o que a IA detectou na conversa — vendedor + prospect
  frequency: number; // % das calls analisadas onde o padrão aparece
  severity: "high" | "medium" | "low";
  suggestedFix: string; // nova redação apenas do trecho com atrito
}

export interface ScriptGapAnalysis {
  analyzedAt: string;
  callsAnalyzed: string[]; // 3 call IDs
  gaps: ScriptGap[];
}

export type PlanCode = "starter" | "pro" | "pro_rag";

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  priceCents: number;
  timelineWeeks: number;
  hasRag: boolean;
  hasTwilio: boolean;
  hasManualUpload: boolean;
  maxSalesPeople: number | null;
  features: string[];
}

// Status efetivo do script associado a uma org. 'none' = org nunca recebeu
// script via Admin. 'deprecated' é derivado: status='active' + existe script
// mais novo na mesma rubric (ver view org_scripts_current na migration 044).
export type OrgScriptStatus =
  | "none"
  | "pending"
  | "active"
  | "deprecated"
  | "rejected";

export interface OrgScriptInfo {
  scriptId: string;
  scriptName: string;
  version: string; // ex: "1.2", "2.0"
  // Quando status='pending' e havia um script anterior aceito, populamos o
  // previousVersion pra UI poder mostrar "v2.0 → v2.1". Null em outros casos.
  previousVersion: string | null;
  status: OrgScriptStatus;
  startedAt: string | null;
  // Preenchido apenas quando status='pending'.
  // 'queued' = aguardando na fila | 'processing' = IA rodando | null = pronto ou sem cache.
  analysisStatus?: "queued" | "processing" | null;
  // org_scripts.id — necessário para cruzar com o cache de análise
  orgScriptId?: string | null;
}

export interface Client {
  id: string;
  name: string;
  planId: string;
  plan: Plan;
  orgId: string;
  callsThisMonth: number;
  avgScore: number;
  // Cobrança por minuto (substitui o MRR fixo). `totalSecondsThisMonth` é o
  // consumo agregado da org no mês (soma de calls.duration_seconds, dinâmico);
  // `totalCostThisMonth` é o valor exato em USD. Ambos só exibidos no painel
  // Admin — Owner nunca vê custo.
  totalSecondsThisMonth: number;
  totalCostThisMonth: number;
  health: HealthStatus;
  trainersCount: number;
  // false = nenhuma membership com role='owner' e invite_status='accepted'
  // existe ainda. Painel Admin renderiza chip "Aguardando Owner" ao lado do
  // nome, mesmo com subscription_status='active' (Admin já vendeu mas Owner
  // não clicou no magic link).
  ownerAccepted: boolean;
  subscriptionStatus: "active" | "inactive" | "trial";
  // Script ativo associado à org (mais recente em org_scripts via started_at
  // desc, ended_at IS NULL). null quando a org nunca recebeu script.
  currentScript: OrgScriptInfo | null;
  // Pending coexistindo com o active (modelo 059). Nome do script pendente
  // pra UI exibir ícone informativo. Optional/null em paths que não
  // computam o pending (single-org fetch, mocks) — só dbListClients popula.
  pendingScriptName?: string | null;
  // ISO timestamp da última atividade na org (max(calls.created_at)).
  // Usado na coluna Last Activity da tabela admin. null se nunca teve calls
  // — cai pra organizations.created_at no caller.
  lastCallAt: string | null;
  createdAt: string;
}

export interface TrendPoint {
  week: string;
  closeRate: number;
  score: number;
}

export interface GlobalMetrics {
  totalClients: number;
  totalCallsThisMonth: number;
  avgScore: number;
}

export type CorrelationLevel = "High" | "Med" | "Low";
export type CorrelationSource = "Rubric" | "Behavioral";

export interface CorrelationFactor {
  label: string;
  score: number;
  correlation: CorrelationLevel;
  impact: CorrelationLevel;
  source: CorrelationSource;
}

export interface RubricGap {
  frequency: number;
  description: string;
}

export interface BestCall {
  id?: string;
  prospect: string;
  date: string;
  score: number;
  result: string;
  analysis: string;
  listenAt: string;
  trainerInitials?: string;
  trainerName?: string;
  trainerColor?: string;
  intentBreakdown?: Record<string, number>;
}

export type CallsByTrainerMap = Record<string, BestCall[]>;

export interface PerformanceTrendPoint {
  week: string;
  // null = semana sem nenhuma call — vira lacuna no gráfico, não uma barra de 0%.
  closeRate: number | null;
  avgScore: number | null;
}

export interface RevenueEstimatorItem {
  section: string;
  current: number;
  target: number;
  monthlyImpact: number;
  confidence: CorrelationLevel;
}

export type MarketingCopyType = "headline" | "primary-text";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface MarketingCopySuggestion {
  id: string;
  type: MarketingCopyType;
  text: string;
  confidence: number;
  basis: string;
  confidenceLevel: ConfidenceLevel;
}

export interface MarketingSourceCall {
  id: string;
  name: string;
  duration: string;
  score: number;
}

export interface MarketingIntelligence {
  lastRun: string;
  nextRun: string;
  sampleSize: number;
  headlines: MarketingCopySuggestion[];
  primaryTexts: MarketingCopySuggestion[];
  sourceCalls: MarketingSourceCall[];
}

export type AiModuleId =
  | "scoring_engine"
  | "correlation_engine"
  | "marketing_intelligence";

export interface AiModuleConfig {
  module_id: AiModuleId;
  temperature: number;
  max_tokens: number;
  updated_by: string;
  updated_at: string;
}

export interface AiModuleConfigLogEntry {
  id: string;
  module_id: AiModuleId;
  field: "temperature" | "max_tokens";
  previous_value: number;
  new_value: number;
  updated_by: string;
  updated_at: string;
}

export interface IntentSignal {
  id: "financial" | "urgency" | "authority" | "engagement";
  weight: number;
  color: RubricColor;
}

export interface IntentBreakdown {
  financial: number;
  urgency: number;
  authority: number;
  engagement: number;
}

export interface OrgIntentWeights {
  orgId: string;
  financial: number;
  urgency: number;
  authority: number;
  engagement: number;
  updatedAt: string;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export type BillingStatus = "PAID" | "PILOT" | "DEMO" | "DISABLED";

export type BillingPeriodRange = "1w" | "2w" | "3w" | "1m";

// ─── Intent dashboard ───────────────────────────────────────────────────────
// Range de tempo da lista de "Highest Priority Leads". Independente de
// BillingPeriodRange (não é faturamento) — usa "15 dias" em vez de "3 semanas".
export type IntentDateRange = "1w" | "2w" | "15d" | "1m";

export type BillingScope = "admin" | "owner";

export interface BillingUsage {
  callsAnalyzed: number;
  billableMinutes: number;
  estimatedValue: number;
  avgCallLengthMin?: number;
  activePayingOrgs?: number;
  totalOrgs?: number;
  valueByOrg?: BillingValueByOrg[];
  callsPerDay?: number[];
  // Custo interno (COGS) real do período — soma de llm_usage_events. Admin only.
  cogs?: number;
}

export interface BillingValueByOrg {
  orgId: string;
  name: string;
  value: number;
}

export interface BillingOrgRow {
  orgId: string;
  name: string;
  status: BillingStatus;
  planName: string;
  ratePerMinute: number | null;
  billableMinutes: number | null;
  callsBilled: number;
  amount: number;
  llmCost: number;
}

export interface BillingHistoryRow {
  period: string;
  inProgress?: boolean;
  calls: number;
  minutes: number;
  amount: number;
}

export interface BillingCycle {
  month: string;
  monthLabel: string;
  amountDue: number;
  billableMinutes: number;
  callsBilled: number;
  avgCallLengthMin: number;
  ratePerMinute: number;
  planName: string;
  cogs?: number;
  rows?: BillingOrgRow[];
  history?: BillingHistoryRow[];
  howYouAreBilled?: string[];
}
