import { http, HttpResponse } from 'msw'
import {
  trainers,
  calls,
  insights,
  clients,
  globalMetrics,
  rubricSections,
  trendData,
  rubric,
  scripts,
  supabaseCalls,
  demoCredentials,
} from '@/lib/mock-data'
import type { CallResult } from '@/lib/types'
import { buildInsightsAnalysis } from './data/insights-analysis'
import {
  outcomeProfiles,
  buildDiscoverySections,
  buildObjectionSections,
  summaryByOutcome,
  mockGeneratedScript,
  mockGeneratedCriteria,
} from './data/call-analysis'

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

  // GET rubrics
  http.get(`${SUPABASE_URL}/rest/v1/rubrics`, ({ request }) => {
    const url = new URL(request.url)
    const isActive = url.searchParams.get('is_active')
    const limit = url.searchParams.get('limit')

    let data = [rubric]
    if (isActive) {
      data = data.filter((r) => String(r.is_active) === isActive.replace('eq.', ''))
    }

    const accept = request.headers.get('accept') || ''
    if (accept.includes('vnd.pgrst.object') || limit === '1') {
      return HttpResponse.json(data[0] || null)
    }
    return HttpResponse.json(data)
  }),

  // GET scripts
  http.get(`${SUPABASE_URL}/rest/v1/scripts`, ({ request }) => {
    const url = new URL(request.url)
    const rubricId = url.searchParams.get('rubric_id')
    const isActive = url.searchParams.get('is_active')
    const order = url.searchParams.get('order')

    let data = [...scripts]
    if (rubricId) {
      data = data.filter((s) => s.rubric_id === rubricId.replace('eq.', ''))
    }
    if (isActive) {
      data = data.filter((s) => String(s.is_active) === isActive.replace('eq.', ''))
    }
    if (order) {
      const { column, ascending } = parseOrderParam(order)
      data = sortByColumn(data, column, ascending) as typeof data
    }
    return HttpResponse.json(data)
  }),

  // POST rubrics (insert — script-builder creates one when none exists)
  http.post(`${SUPABASE_URL}/rest/v1/rubrics`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const newRubric = {
      ...rubric,
      id: `rubric-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...body,
    }
    const accept = request.headers.get('accept') || ''
    if (accept.includes('vnd.pgrst.object')) {
      return HttpResponse.json(newRubric, { status: 201 })
    }
    return HttpResponse.json([newRubric], { status: 201 })
  }),

  // PATCH rubrics (settings update)
  http.patch(`${SUPABASE_URL}/rest/v1/rubrics`, () => {
    return HttpResponse.json(rubric)
  }),

  // POST scripts (create)
  http.post(`${SUPABASE_URL}/rest/v1/scripts`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const newScript = {
      id: `script-${Date.now()}`,
      created_at: new Date().toISOString(),
      is_active: true,
      ...body,
    }
    return HttpResponse.json([newScript], { status: 201 })
  }),

  // PATCH scripts (update)
  http.patch(`${SUPABASE_URL}/rest/v1/scripts`, () => {
    return HttpResponse.json({})
  }),

  // DELETE scripts
  http.delete(`${SUPABASE_URL}/rest/v1/scripts`, () => {
    return HttpResponse.json({})
  }),

  // Supabase Auth — bypass (handled by real Supabase)
]

// ─── New views API handlers (MSW-only, no server route) ──────────────────────

const apiHandlers = [
  // GET /api/calls
  http.get('/api/calls', ({ request }) => {
    const url = new URL(request.url)
    const filterTrainer = url.searchParams.get('trainerId')
    const filterResult = url.searchParams.get('result') as CallResult | null

    let data = [...calls]
    if (filterTrainer) {
      data = data.filter((c) => c.trainerId === filterTrainer)
    }
    if (filterResult) {
      data = data.filter((c) => c.result === filterResult)
    }
    return ok(data)
  }),

  // GET /api/calls/:id
  http.get('/api/calls/:id', ({ params }) => {
    const call = calls.find((c) => c.id === params.id)
    if (!call) return notFound('Call')
    return ok(call)
  }),

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

  // POST /api/insights — mock da análise de padrões (real usa LLM)
  http.post('/api/insights', async () => {
    return HttpResponse.json(buildInsightsAnalysis(calls))
  }),

  // GET /api/clients
  http.get('/api/clients', () => {
    return ok({ clients, metrics: globalMetrics })
  }),

  // GET /api/rubric
  http.get('/api/rubric', () => {
    return ok({ sections: rubricSections, trend: trendData })
  }),

  // GET /api/rubric-config — rubric completa com system_prompt e llm_model
  http.get('/api/rubric-config', () => {
    return ok(rubric)
  }),

  // PATCH /api/rubric-config — atualização mock (visual only na Fase 1)
  http.patch('/api/rubric-config', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return ok({ ...rubric, ...body })
  }),

  // GET /api/scripts
  http.get('/api/scripts', ({ request }) => {
    const url = new URL(request.url)
    const rubricId = url.searchParams.get('rubricId')
    const activeOnly = url.searchParams.get('active')
    let data = [...scripts]
    if (rubricId) data = data.filter((s) => s.rubric_id === rubricId)
    if (activeOnly === 'true') data = data.filter((s) => s.is_active)
    return ok(data)
  }),

  // POST /api/scripts — create mock (visual only na Fase 1)
  http.post('/api/scripts', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const newScript = {
      id: `script-${Date.now()}`,
      created_at: new Date().toISOString(),
      is_active: true,
      rubric_id: 'rubric-001',
      ...body,
    }
    return ok(newScript)
  }),

  // PATCH /api/scripts/:id — update mock
  http.patch('/api/scripts/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return ok({ id: params.id, ...body })
  }),

  // DELETE /api/scripts/:id — delete mock
  http.delete('/api/scripts/:id', ({ params }) => {
    return ok({ id: params.id, deleted: true })
  }),
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

  // POST /api/transcribe — mock transcrição
  http.post('/api/transcribe', async () => {
    return HttpResponse.json({
      transcript:
        'Trainer: Oi, obrigado por reservar um tempo hoje. Me conta — o que está acontecendo com o seu cão?\nProspecto: Ele não obedece nada. Já tentei de tudo...\nTrainer: Entendo. Quando você diz que ele não obedece, me dá um exemplo concreto?\nProspecto: Na semana passada ele fugiu do quintal de novo. Ficamos 2 horas procurando.\nTrainer: Nossa, que situação. E isso afeta o dia a dia de vocês?\nProspecto: Minha esposa já falou que se não resolver, vai ter que dar o cachorro.\nTrainer: Entendo a gravidade. Deixa eu te mostrar como a gente resolve isso...',
    })
  }),

  // POST /api/analyze — mock análise de call (scores 1-5 por section)
  http.post('/api/analyze', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const scriptId = body.scriptId as string
    const outcome = body.callOutcome as string

    const profile = outcomeProfiles[outcome] || outcomeProfiles.no_decision
    const isDiscoveryScript = scriptId === 'script-001'

    const sections = isDiscoveryScript
      ? buildDiscoverySections(profile.scores)
      : buildObjectionSections(profile.scores)

    const result = summaryByOutcome[outcome] || summaryByOutcome.no_decision

    return HttpResponse.json({
      sections,
      overallScore: profile.overall,
      detectedOutcome: profile.detected,
      summary: result.summary,
      strengths: result.strengths,
      improvements: result.improvements,
      transcript: body.transcript || 'Transcript analisado...',
      scriptId: scriptId || 'script-001',
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

  // POST /api/generate-script — mock geração de script
  http.post('/api/generate-script', async () => {
    return HttpResponse.json(mockGeneratedScript)
  }),

  // POST /api/generate-criteria — mock geração de critérios
  http.post('/api/generate-criteria', async () => {
    return HttpResponse.json(mockGeneratedCriteria)
  }),
]

// ─── Export all handlers ──────────────────────────────────────────────────────

export const handlers = [...supabaseHandlers, ...apiHandlers, ...dashboardApiHandlers, ...authHandlers]
