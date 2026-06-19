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
export type IntentScore = 1 | 2 | 3 | 4 | 5;
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
  trainerId: string;
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
  // Status do pipeline GHL (transcription_failed, no_recording, etc.)
  processingStatus?: string | null;
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
  prospect: string;
  date: string;
  score: number;
  result: string;
  analysis: string;
  listenAt: string;
  trainerInitials?: string;
  trainerName?: string;
  trainerColor?: string;
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

// ─── Billing ─────────────────────────────────────────────────────────────────
// Feature de exposição de valor para cobrança MANUAL fora da plataforma. O
// front NÃO calcula nada — todos os valores chegam prontos no payload (amount,
// billableMinutes, ratePerMinute, etc.). Owner NUNCA recebe cogs/llmCost/outras
// orgs (filtrado no handler). Ver askmoses-billing-mock.html + handoff.

export type BillingStatus = "PAID" | "PILOT" | "DEMO" | "DISABLED";

// Presets do seletor do Bloco 1 (janela rolante). NÃO afeta o Bloco 2.
export type BillingPeriodRange = "1w" | "2w" | "3w" | "1m";

export type BillingScope = "admin" | "owner";

// Bloco 1 — Usage in period (rolling). Cards de monitoramento.
export interface BillingUsage {
  callsAnalyzed: number;
  billableMinutes: number;
  estimatedValue: number; // USD — rótulo "not the billed amount"
  // Owner mostra avgCallLengthMin; Admin mostra activePayingOrgs/totalOrgs.
  avgCallLengthMin?: number;
  activePayingOrgs?: number;
  totalOrgs?: number;
  // Bar list "Estimated value by organization" (admin only). Ordenado desc.
  valueByOrg?: BillingValueByOrg[];
  // Sparkline "Calls per day · last 14 days" (owner only).
  callsPerDay?: number[];
  // Custo interno (COGS) real do período — soma de llm_usage_events. Admin only.
  cogs?: number;
}

export interface BillingValueByOrg {
  orgId: string;
  name: string;
  value: number; // USD
}

// Linha da tabela de orgs (Bloco 2, admin). PILOT/DISABLED vêm zeradas:
// ratePerMinute/billableMinutes = null (UI mostra "—"), amount/llmCost = 0.
export interface BillingOrgRow {
  orgId: string;
  name: string;
  status: BillingStatus;
  planName: string;
  ratePerMinute: number | null;
  billableMinutes: number | null;
  callsBilled: number;
  amount: number; // USD
  llmCost: number; // USD — admin only
}

export interface BillingHistoryRow {
  period: string; // ex.: "June 2026"
  inProgress?: boolean;
  calls: number;
  minutes: number;
  amount: number; // USD
}

// Bloco 2 — Billing cycle (calendar month). Base da cobrança manual.
// Campos admin-only (cogs, rows com llmCost) são OMITIDOS do payload owner.
export interface BillingCycle {
  month: string; // "YYYY-MM"
  monthLabel: string; // "June 2026"
  amountDue: number; // USD
  billableMinutes: number;
  callsBilled: number;
  avgCallLengthMin: number;
  ratePerMinute: number;
  planName: string;
  cogs?: number; // admin only — custo interno (COGS)
  rows?: BillingOrgRow[]; // admin only — tabela de orgs
  history?: BillingHistoryRow[]; // owner only — usage history
  // Copy configurável de "How you're billed" (regras pendentes §7 do handoff —
  // não hardcodar no front). Owner only.
  howYouAreBilled?: string[];
}
