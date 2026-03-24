export type Role = 'trainer' | 'owner' | 'admin'
export type CallResult = 'closed' | 'no-close' | 'follow-up'
export type HealthStatus = 'healthy' | 'at-risk' | 'churning'
export type AvatarColor = 'blue' | 'purple' | 'green' | 'red'
export type TagColor = 'red' | 'amber' | 'blue' | 'green'
export type RubricColor = 'blue' | 'amber' | 'green' | 'red' | 'accent2'

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
  avatar: string
  avatarColor: AvatarColor
  role: Role
  totalCalls: number
  closeRate: number
  closeDelta: number
  score: number
  lastActive: string
  ownerId: string
  rubricScores: RubricScores
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
  rubricScores: RubricScores
  feedback: string
  strengths: string[]
  improvements: string[]
  transcript: string
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

export interface Client {
  id: string
  name: string
  plan: 'Starter' | 'Pro' | 'Pro+RAG'
  callsThisMonth: number
  avgScore: number
  mrr: number
  health: HealthStatus
  trainersCount: number
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
