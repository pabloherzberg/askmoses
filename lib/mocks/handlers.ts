import { http, HttpResponse } from 'msw'
import {
  insights,
  clients,
  globalMetrics,
  supabaseCalls,
  demoCredentials,
  aiModuleConfigs,
  aiModuleConfigLog,
  intentSignals,
  mockBillingUsage,
  mockBillingCycle,
} from '@/lib/mock-data'
import type { AiModuleId } from '@/lib/types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null })
}

function notFound(resource: string) {
  return HttpResponse.json(
    { data: null, error: { message: `${resource} not found`, code: 404 } },
    { status: 404 }
  )
}


// ─── Supabase PostgREST handlers ─────────────────────────────────────────────

function parseOrderParam(order: string | null) {
  if (!order) return { column: 'created_at', ascending: false }
  const parts = order.split('.')
  return { column: parts[0], ascending: parts[1] === 'asc' }
}

function sortByColumn<T>(data: T[], column: string, ascending: boolean): T[] {
  return [...data].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[column]
    const bVal = (b as Record<string, unknown>)[column]
    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1
    const cmp = aVal < bVal ? -1 : 1
    return ascending ? cmp : -cmp
  })
}

const supabaseHandlers = [
  // GET calls
  http.get(`${SUPABASE_URL}/rest/v1/calls`, ({ request }) => {
    const url = new URL(request.url)
    const order = url.searchParams.get('order')
    const { column, ascending } = parseOrderParam(order)
    const sorted = sortByColumn(supabaseCalls, column, ascending)
    return HttpResponse.json(sorted)
  }),

  // rubrics + scripts — delegado para Supabase real (sem mock)
  // Supabase Auth — bypass (handled by real Supabase)
]

// ─── New views API handlers (MSW-only, no server route) ──────────────────────

const apiHandlers = [
  // GET /api/calls — passthrough to real API route (Supabase, org-scoped).
  // GET /api/calls/:id — passthrough to real API route (Supabase, org-scoped).

  // GET /api/trainers — passthrough to real API route (Supabase, org-scoped).
  // This handler used to return the global mock list from lib/mock-data.ts,
  // which leaked Dog Wizard HQ trainers to every owner regardless of their
  // session org. The real /api/trainers route filters by JWT.org_id, so we
  // remove the mock and let the fetch fall through.

  // GET /api/insights
  http.get('/api/insights', () => {
    return ok(insights)
  }),

  // POST /api/insights — passthrough to real API route (Gemini)

  // GET /api/clients
  http.get('/api/clients', () => {
    return ok({ clients, metrics: globalMetrics })
  }),

  // GET /api/ai-module-configs
  http.get('/api/ai-module-configs', () => {
    return ok({ configs: aiModuleConfigs, log: aiModuleConfigLog })
  }),

  // GET /api/billing/usage
  http.get('/api/billing/usage', ({ request }) => {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') ?? 'owner'
    const range = (url.searchParams.get('range') ?? '1m') as import('@/lib/types').BillingPeriodRange
    return ok(mockBillingUsage(scope, range))
  }),

  // GET /api/billing/cycle
  http.get('/api/billing/cycle', ({ request }) => {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') ?? 'owner'
    const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
    return ok(mockBillingCycle(scope, month))
  }),

  // PUT /api/ai-module-configs
  http.put('/api/ai-module-configs', async ({ request }) => {
    const body = await request.json() as { module_id: AiModuleId; temperature: number; max_tokens: number; updated_by: string }
    const idx = aiModuleConfigs.findIndex((c) => c.module_id === body.module_id)
    if (idx === -1) {
      return HttpResponse.json({ data: null, error: { message: 'Module not found', code: 404 } }, { status: 404 })
    }
    const prev = aiModuleConfigs[idx]
    const now = new Date().toISOString()
    if (prev.temperature !== body.temperature) {
      aiModuleConfigLog.unshift({ id: `log-${Date.now()}-t`, module_id: body.module_id, field: 'temperature', previous_value: prev.temperature, new_value: body.temperature, updated_by: body.updated_by, updated_at: now })
    }
    if (prev.max_tokens !== body.max_tokens) {
      aiModuleConfigLog.unshift({ id: `log-${Date.now()}-m`, module_id: body.module_id, field: 'max_tokens', previous_value: prev.max_tokens, new_value: body.max_tokens, updated_by: body.updated_by, updated_at: now })
    }
    aiModuleConfigs[idx] = { ...prev, temperature: body.temperature, max_tokens: body.max_tokens, updated_by: body.updated_by, updated_at: now }
    return ok({ config: aiModuleConfigs[idx], log: aiModuleConfigLog })
  }),

  // GET /api/coaching — passthrough to real API route (server-side translation
  // of bestCalls/worstCalls.analysis, coachingRecs, and behavioral dimensions)

  // GET /api/intent-signals — Intent weights and signal metadata
  http.get('/api/intent-signals', () => {
    return ok({ signals: intentSignals })
  }),

  // GET /api/rubric — delegado para API route real (Supabase)
  // GET /api/rubric?config=true — delegado para API route real (Supabase)
  // POST /api/scripts — delegado para API route real (Supabase)
  // PATCH/DELETE /api/scripts/:id — delegado para API route real (Supabase)
]

// ─── Auth handlers (mock para demo — substitui Supabase Auth) ────────────────

const authHandlers = [
  // POST /api/auth/login
  http.post('/api/auth/login', async ({ request }) => {
    const { email, password } = await request.json() as { email: string; password: string }
    const user = demoCredentials.find((u) => u.email === email && u.password === password)
    if (!user) {
      return HttpResponse.json(
        { data: null, error: { message: 'Email ou senha incorretos', code: 401 } },
        { status: 401 }
      )
    }
    return ok({ user: { id: `demo-${user.role}`, email: user.email, role: user.role, name: user.name, trainerId: user.trainerId } })
  }),

  // POST /api/auth/logout
  http.post('/api/auth/logout', () => {
    return ok({ message: 'Logged out' })
  }),
]

// ─── Dashboard API handlers (substituem as API routes deletadas) ─────────────

const dashboardApiHandlers = [
  // POST /api/blob-token — mock upload de áudio
  http.post('/api/blob-token', async () => {
    return HttpResponse.json({
      url: 'https://mock-blob.vercel-storage.com/demo-audio-123.mp3',
    })
  }),

  // POST /api/send-insights — mock envio de email de insights
  http.post('/api/send-insights', async () => {
    return HttpResponse.json({
      success: true,
      emailId: `mock-email-insights-${Date.now()}`,
    })
  }),

  // POST /api/generate-script — delegado para API route real (Gemini)
  // POST /api/generate-criteria — delegado para API route real
]

// ─── Export all handlers ──────────────────────────────────────────────────────

export const handlers = [...supabaseHandlers, ...apiHandlers, ...dashboardApiHandlers, ...authHandlers]
