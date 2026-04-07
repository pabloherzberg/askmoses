import { http, HttpResponse } from 'msw'
import {
  trainers,
  insights,
  clients,
  globalMetrics,
  rubricSections,
  trendData,
  supabaseCalls,
  demoCredentials,
} from '@/lib/mock-data'

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
  // GET /api/calls — passthrough to real API route (Supabase)
  // GET /api/calls/:id — passthrough to real API route (Supabase)

  // GET /api/trainers
  http.get('/api/trainers', () => {
    const totalCalls = trainers.reduce((sum, t) => sum + t.totalCalls, 0)
    const avgScore = Math.round(trainers.reduce((sum, t) => sum + t.score, 0) / trainers.length)
    const avgCloseRate = Math.round(trainers.reduce((sum, t) => sum + t.closeRate, 0) / trainers.length)
    const bestTrainer = trainers.reduce((best, t) => (t.score > best.score ? t : best), trainers[0])

    const stats = { totalCalls, avgScore, avgCloseRate, bestTrainer: bestTrainer.name, activeTrainers: trainers.length }
    return ok({ trainers, stats })
  }),

  // GET /api/insights
  http.get('/api/insights', () => {
    return ok(insights)
  }),

  // POST /api/insights — passthrough to real API route (Gemini)

  // GET /api/clients
  http.get('/api/clients', () => {
    return ok({ clients, metrics: globalMetrics })
  }),

  // GET /api/rubric
  http.get('/api/rubric', () => {
    return ok({ sections: rubricSections, trend: trendData })
  }),

  // GET /api/rubric-config — delegado para API route real (Supabase)
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

  // POST /api/send-coaching — mock envio de email de coaching
  http.post('/api/send-coaching', async () => {
    return HttpResponse.json({
      success: true,
      emailId: `mock-email-${Date.now()}`,
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
