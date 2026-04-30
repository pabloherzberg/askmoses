/**
 * AskMoses.AI — Setup multi-tenant (3 Clients × Plans)
 *
 * Pré-requisitos (rodar no Supabase SQL Editor antes deste script):
 *   1. scripts/012_create_organizations.sql
 *   2. scripts/013_seed_demo_org.sql
 *   3. scripts/018_create_plans_and_link_clients.sql
 *   4. scripts/019_seed_three_clients.sql
 *
 * Mapeamento (alinhado com a base real — ver Downloads/*_rows.json):
 *   org 100 → Dog Wizard HQ      → Pro      → 4 trainers (já existem do 013)
 *   org 200 → K9 Elite Training  → Pro+RAG  → 4 trainers (criados aqui)
 *   org 300 → Paw Academy        → Starter  → 4 trainers (criados aqui)
 *
 * O que este script faz:
 *   - Cria/atualiza Auth users via Auth Admin API (1 owner + 4 trainers
 *     para cada org 200 e 300 = 10 novos; org 100 já tem trainers do 013)
 *   - Cada user recebe app_metadata = { role, org_id } correto
 *   - UPSERTa em public.profiles → trigger set_role_claim propaga claims
 *   - UPSERTa em public.users (denormalizado, usado por /api/me)
 *   - INSERT em public.trainers (4 por org × 2 orgs novas = 8)
 *   - INSERT em public.rubrics + criteria para os 2 orgs novos
 *   - INSERT em public.calls (~5 por trainer dos 2 orgs novos = ~40 calls)
 *   - INSERT em public.insights (4 por org × 2 orgs novos = 8 insights)
 *
 * Rodar: node scripts/setup-three-clients.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Carrega .env.local manualmente (sem dotenv) para que o script use o mesmo
// projeto Supabase que a aplicação Next.js. Cai para os defaults antigos
// (projeto demo "ahusozxvfdbapnyztmva") só se nada estiver definido.
function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key]) continue
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    process.env[key] = value
  }
}
loadEnvLocal()

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('✗ Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL). Set it in .env.local before running this seed.')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_SERVICE_ROLE_KEY. This script needs the service-role key (admin) — never commit it. Set SUPABASE_SERVICE_ROLE_KEY in .env.local before running.')
  process.exit(1)
}

console.log(`Supabase target: ${SUPABASE_URL}\n`)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_DOG_WIZARD_HQ = '00000000-0000-0000-0000-000000000100'
const ORG_K9_ELITE      = '00000000-0000-0000-0000-000000000200'
const ORG_PAW_ACADEMY   = '00000000-0000-0000-0000-000000000300'

const PASSWORD = 'demo123'

// ─── Roster (apenas org 200 e 300 — org 100 já vem do 013) ────────────────────

const ORG_LABEL = {
  [ORG_K9_ELITE]:    { company: 'K9 Elite Training', plan: 'Pro+RAG' },
  [ORG_PAW_ACADEMY]: { company: 'Paw Academy',       plan: 'Starter' },
}

const NEW_USERS = [
  // K9 Elite Training (Pro + RAG) — top performers, RAG advantage
  { email: 'owner-k9elite@demo.askmoses.ai',    role: 'owner',   orgId: ORG_K9_ELITE, name: 'Diana K.',  avatar: 'DK', avatarColor: 'purple', trainerStats: null },
  { email: 'trainer-k9elite-1@demo.askmoses.ai', role: 'trainer', orgId: ORG_K9_ELITE, name: 'Priya V.',  avatar: 'PV', avatarColor: 'green',  trainerStats: { totalCalls: 38, score: 93, scoreDelta: 8, closeRate: 78, closeDelta: 9, rubric: { discovery: 95, problemAgitation: 91, offerPresentation: 94, objectionHandling: 89, closeAndNextSteps: 93 } } },
  { email: 'trainer-k9elite-2@demo.askmoses.ai', role: 'trainer', orgId: ORG_K9_ELITE, name: 'Felix C.',  avatar: 'FC', avatarColor: 'blue',   trainerStats: { totalCalls: 32, score: 89, scoreDelta: 5, closeRate: 72, closeDelta: 6, rubric: { discovery: 91, problemAgitation: 87, offerPresentation: 90, objectionHandling: 85, closeAndNextSteps: 90 } } },
  { email: 'trainer-k9elite-3@demo.askmoses.ai', role: 'trainer', orgId: ORG_K9_ELITE, name: 'Yuki H.',   avatar: 'YH', avatarColor: 'purple',  trainerStats: { totalCalls: 27, score: 86, scoreDelta: 3, closeRate: 68, closeDelta: 3, rubric: { discovery: 88, problemAgitation: 84, offerPresentation: 87, objectionHandling: 82, closeAndNextSteps: 88 } } },
  { email: 'trainer-k9elite-4@demo.askmoses.ai', role: 'trainer', orgId: ORG_K9_ELITE, name: 'Leo D.',    avatar: 'LD', avatarColor: 'red',    trainerStats: { totalCalls: 22, score: 84, scoreDelta: 1, closeRate: 64, closeDelta: 2, rubric: { discovery: 86, problemAgitation: 82, offerPresentation: 85, objectionHandling: 80, closeAndNextSteps: 86 } } },

  // Paw Academy (Starter) — newer team, lower scores, at-risk
  { email: 'owner-pawacademy@demo.askmoses.ai',    role: 'owner',   orgId: ORG_PAW_ACADEMY, name: 'Ricardo M.', avatar: 'RM', avatarColor: 'blue',   trainerStats: null },
  { email: 'trainer-pawacademy-1@demo.askmoses.ai', role: 'trainer', orgId: ORG_PAW_ACADEMY, name: 'Alex P.',    avatar: 'AP', avatarColor: 'blue',   trainerStats: { totalCalls: 28, score: 78, scoreDelta:  2, closeRate: 58, closeDelta:  3, rubric: { discovery: 80, problemAgitation: 72, offerPresentation: 78, objectionHandling: 70, closeAndNextSteps: 76 } } },
  { email: 'trainer-pawacademy-2@demo.askmoses.ai', role: 'trainer', orgId: ORG_PAW_ACADEMY, name: 'Sofia G.',   avatar: 'SG', avatarColor: 'purple',  trainerStats: { totalCalls: 24, score: 75, scoreDelta: -1, closeRate: 54, closeDelta: -2, rubric: { discovery: 76, problemAgitation: 70, offerPresentation: 75, objectionHandling: 68, closeAndNextSteps: 72 } } },
  { email: 'trainer-pawacademy-3@demo.askmoses.ai', role: 'trainer', orgId: ORG_PAW_ACADEMY, name: 'Hassan B.',  avatar: 'HB', avatarColor: 'green',  trainerStats: { totalCalls: 19, score: 71, scoreDelta: -3, closeRate: 49, closeDelta: -5, rubric: { discovery: 70, problemAgitation: 65, offerPresentation: 73, objectionHandling: 62, closeAndNextSteps: 68 } } },
  { email: 'trainer-pawacademy-4@demo.askmoses.ai', role: 'trainer', orgId: ORG_PAW_ACADEMY, name: 'Naomi T.',   avatar: 'NT', avatarColor: 'red',    trainerStats: { totalCalls: 16, score: 68, scoreDelta: -4, closeRate: 45, closeDelta: -6, rubric: { discovery: 68, problemAgitation: 60, offerPresentation: 70, objectionHandling: 58, closeAndNextSteps: 64 } } },
]

// Sample call shapes per trainer skill level (for procedural generation)
const CALL_TEMPLATES = {
  high: [
    { prospect: 'Bob W.',    score: 94, result: 'closed',      breed: 'Rex (German Shepherd)', strengths: ['4 open-ended questions before pitch','Identified pain (escaping yard) under 5min','Handled price objection with concrete ROI'], improvements: ['Could deepen problem agitation more'], summary: 'Excellent call — discovery mastery, pressure-free close.' },
    { prospect: 'Sarah K.',  score: 91, result: 'closed',      breed: 'Thor (Husky)',          strengths: ['Found separation anxiety in 3 questions','Connected offer directly to pain','Held full price'], improvements: ['Agitation could use specific numbers'], summary: 'Open-ended questioning method masterful.' },
    { prospect: 'Mike D.',   score: 89, result: 'closed',      breed: 'Bolt (Boxer)',          strengths: ['Found the social embarrassment angle','Used specific Golden case study'], improvements: ['Could spend more time in agitation'], summary: 'Solid call. Discovery → offer at the right moment.' },
    { prospect: 'Linda P.',  score: 88, result: 'closed',      breed: 'Bella (Lab)',           strengths: ['Kept prospect engaged 45min','Created urgency with limited spots'], improvements: ['Next steps could be more specific'], summary: 'Longer call, full control throughout.' },
    { prospect: 'Tom R.',    score: 86, result: 'closed',      breed: 'Max (Golden)',          strengths: ['Read qualified prospect, accelerated','Plans presented in ascending value'], improvements: ['Discovery slightly short'], summary: 'Efficient — adapted pace to ready buyer.' },
  ],
  mid: [
    { prospect: 'Diana M.',  score: 81, result: 'closed',      breed: 'Toby (Poodle)',         strengths: ['Empathetic problem agitation','Closed before resistance surfaced'], improvements: ['Could explore prior attempts more'], summary: 'Strong agitation, prospect emotionally engaged.' },
    { prospect: 'Robert L.', score: 78, result: 'closed',      breed: 'Luna (Border Collie)',  strengths: ['Calibrated agitation level','Used same-breed case'], improvements: ['Close hesitant'], summary: 'Well-conducted, slight hesitation.' },
    { prospect: 'Karen H.',  score: 76, result: 'follow_up',   breed: 'Buddy (Mix)',           strengths: ['Identified co-decision maker','Specific follow-up time'], improvements: ['Could ID co-decision maker earlier'], summary: 'Spouse not on call — follow-up booked.' },
    { prospect: 'Steve N.',  score: 72, result: 'closed',      breed: 'Rocky (Pit)',           strengths: ['Direct tone matched prospect','Closed despite short call'], improvements: ['Left money on table — could agitate more'], summary: 'Short close, missed upsell.' },
  ],
  low: [
    { prospect: 'Helen K.',  score: 68, result: 'no_decision', breed: 'Ziggy (Reactive)',      strengths: ['Knows program specs'], improvements: ['Discovery too technical','Pulled back on hesitation'], summary: 'Too technical, not enough emotion.' },
    { prospect: 'Paul M.',   score: 65, result: 'no_decision', breed: 'Charlie (Shepherd)',    strengths: ['Structured presentation'], improvements: ['Defensive on price','Agitation rushed'], summary: 'Lost on objections — went into justify mode.' },
    { prospect: 'Alice N.',  score: 62, result: 'follow_up',   breed: 'Mel (Mix)',             strengths: ['Scheduled follow-up'], improvements: ['Only 2 discovery questions','Insecure tone'], summary: 'Timid call, prospect noncommittal.' },
    { prospect: 'George T.', score: 58, result: 'no_decision', breed: 'Brutus (Mastiff)',      strengths: ['Kept prospect 25min'], improvements: ['Lost control','No close attempt'], summary: 'Concerning — passive, prospect drove call.' },
  ],
}

const RUBRIC_BY_ORG = {
  [ORG_K9_ELITE]:    { id: 'b4e99b19-b2f7-4ab3-b48e-e171e1ee0001', name: 'K9 Elite RAG Sales Rubric',     modelOverride: 'openai/gpt-4o' },
  [ORG_PAW_ACADEMY]: { id: 'b4e99b19-b2f7-4ab3-b48e-e171e1ee0002', name: 'Paw Academy Starter Sales Rubric', modelOverride: 'openai/gpt-4o-mini' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createAuthUser({ email, role, orgId }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role, org_id: orgId },
  })

  if (error) {
    if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 })
      if (listErr) throw listErr
      const existing = list.users.find((u) => u.email === email)
      if (!existing) throw new Error(`User ${email} not found after conflict`)
      // Update app_metadata in case org changed — must succeed, otherwise the
      // existing user keeps stale role/org_id claims and downstream auth breaks.
      const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: { ...(existing.app_metadata ?? {}), role, org_id: orgId },
      })
      if (updateErr) {
        throw new Error(`createAuthUser(${email}): updateUserById failed: ${updateErr.message}`)
      }
      return existing.id
    }
    throw error
  }
  return data.user.id
}

// Em ambientes que têm tabela `profiles` (com trigger set_role_claim → JWT),
// fazemos UPSERT. Em ambientes que não têm (ex.: askmoses-dev), o
// app_metadata já foi setado via auth.admin.createUser — pulamos silencioso.
async function upsertProfile(userId, role, orgId) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, role, org_id: orgId, owner_id: null }, { onConflict: 'id' })
  if (!error) return
  if (
    error.message?.includes("Could not find the table 'public.profiles'") ||
    error.code === '42P01'
  ) {
    return // schema sem profiles — JWT já vem de auth.users.raw_app_meta_data
  }
  throw error
}

async function upsertPublicUser(userId, { name, email, avatar, avatarColor, role }) {
  const { error } = await supabase
    .from('users')
    .upsert(
      // Seed users já são "aceitos" — eles têm credenciais via createUser e
      // podem logar imediatamente. Sem isso, o default 'pending' do 020 faria
      // eles serem ocultados em dbGetTrainers (filtra por invite_status='accepted').
      { id: userId, name, email, avatar, avatar_color: avatarColor, role, invite_status: 'accepted' },
      { onConflict: 'id' }
    )
  if (error) throw error
}

// Schema askmoses-dev: tabela `owners` separada com (id, user_id, company,
// plan). trainers.owner_id FKs aqui — não para users.id direto. Cria/upserta
// e devolve owners.id para uso no trainers.owner_id.
async function upsertOwnerRecord(userUserId, company, planLabel) {
  // Tenta achar pelo user_id primeiro (ON CONFLICT em user_id)
  const { data: existing } = await supabase
    .from('owners')
    .select('id')
    .eq('user_id', userUserId)
    .maybeSingle()

  if (existing) return existing.id

  const { data, error } = await supabase
    .from('owners')
    .insert({ user_id: userUserId, company, plan: planLabel })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function upsertTrainer(userId, orgId, ownerUserId, stats) {
  if (!stats) return null
  const { data, error } = await supabase
    .from('trainers')
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        owner_id: ownerUserId,
        total_calls: stats.totalCalls,
        close_rate:  stats.closeRate,
        close_delta: stats.closeDelta,
        score:       stats.score,
        score_delta: stats.scoreDelta,
        last_active: new Date().toISOString(),
        score_discovery:           stats.rubric.discovery,
        score_problem_agitation:   stats.rubric.problemAgitation,
        score_offer_presentation:  stats.rubric.offerPresentation,
        score_objection_handling:  stats.rubric.objectionHandling,
        score_close_next_steps:    stats.rubric.closeAndNextSteps,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function ensureRubric(orgId) {
  const cfg = RUBRIC_BY_ORG[orgId]
  if (!cfg) return null

  // Upsert rubric
  const { error: rubricErr } = await supabase
    .from('rubrics')
    .upsert(
      {
        id: cfg.id,
        org_id: orgId,
        name: cfg.name,
        description: 'Auto-seeded rubric for this tenant',
        is_active: true,
        system_prompt: 'You are an expert sales coach for dog training businesses. Evaluate the call against the criteria.',
        llm_model: cfg.modelOverride,
      },
      { onConflict: 'id' }
    )
  if (rubricErr) throw rubricErr

  // Standard 5 criteria — same shape as 001_create_rubrics.sql
  const criteria = [
    { name: 'Discovery',          description: 'Open-ended questions and active listening before any pitch.', sort_order: 1 },
    { name: 'Problem Agitation',  description: 'Deepen the prospect pain — emotional and financial impact.',  sort_order: 2 },
    { name: 'Offer Presentation', description: 'Connect the offer to the identified pain.',                   sort_order: 3 },
    { name: 'Objection Handling', description: 'Reframe objections without defensive posture.',                sort_order: 4 },
    { name: 'Close & Next Steps', description: 'Clear commitment or next step before hanging up.',             sort_order: 5 },
  ]
  for (const c of criteria) {
    const { error: upsertErr } = await supabase
      .from('criteria')
      .upsert(
        { rubric_id: cfg.id, org_id: orgId, ...c },
        { onConflict: 'rubric_id,name' }
      )
    if (!upsertErr || upsertErr.message?.includes('duplicate')) continue

    // Some schemas don't have a uniqueness constraint — fall back to checking existence first
    const { data: existing, error: selectErr } = await supabase
      .from('criteria')
      .select('id')
      .eq('rubric_id', cfg.id)
      .eq('name', c.name)
      .maybeSingle()
    if (selectErr) {
      throw new Error(`ensureRubric(${orgId}): criteria lookup failed for "${c.name}": ${selectErr.message} (upsert: ${upsertErr.message})`)
    }
    if (existing) continue

    const { error: insertErr } = await supabase
      .from('criteria')
      .insert({ rubric_id: cfg.id, org_id: orgId, ...c })
    if (insertErr) {
      throw new Error(`ensureRubric(${orgId}): criteria insert failed for "${c.name}": ${insertErr.message} (upsert: ${upsertErr.message})`)
    }
  }

  return cfg.id
}

function callsForTrainer(orgId, trainerId, trainerName, trainerEmail, rubricId, level, baseDate, calls = 5) {
  const templates = CALL_TEMPLATES[level]
  const out = []
  for (let i = 0; i < calls; i++) {
    const t = templates[i % templates.length]
    // Spread dates across past 6 weeks
    const date = new Date(baseDate)
    date.setDate(date.getDate() - i * 4 - Math.floor(Math.random() * 3))
    const skew = (i * 13) % 7 - 3 // small variation
    const score = Math.max(50, Math.min(99, t.score + skew))
    const rubricArr = [
      { name: 'Discovery',          score: Math.max(50, Math.min(99, score + 2)), feedback: 'Evaluated' },
      { name: 'Problem Agitation',  score: Math.max(45, Math.min(99, score - 4)), feedback: 'Evaluated' },
      { name: 'Offer Presentation', score: Math.max(50, Math.min(99, score + 1)), feedback: 'Evaluated' },
      { name: 'Objection Handling', score: Math.max(40, Math.min(99, score - 6)), feedback: 'Evaluated' },
      { name: 'Close & Next Steps', score: Math.max(45, Math.min(99, score - 1)), feedback: 'Evaluated' },
    ]
    out.push({
      rubric_id: rubricId,
      org_id: orgId,
      trainer_id: trainerId,
      trainer_name: trainerName,
      trainer_email: trainerEmail,
      client_name: t.prospect,
      transcript: `[Demo] ${trainerName} → ${t.prospect}\nDog: ${t.breed}\n${t.summary}\n...`,
      overall_score: score,
      total_criteria: 5,
      criteria: rubricArr,
      summary: t.summary,
      strengths: t.strengths,
      improvements: t.improvements,
      call_outcome: t.result === 'closed' ? 'closed' : t.result === 'no_decision' ? 'not_closed' : 'partial',
      detected_outcome: t.result,
      email_sent: false,
      created_at: date.toISOString(),
      updated_at: date.toISOString(),
    })
  }
  return out
}

async function insertCalls(rows) {
  // Insert in batches of 10 to avoid payload-size issues
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10)
    const { error } = await supabase.from('calls').insert(batch)
    if (error) throw error
  }
}

async function seedInsights(orgId, planLabel) {
  const insights = [
    { type: 'risk',    icon: '🚨', title: `${planLabel}: Objection handling is the biggest leak`, tag: 'Team pattern',  tag_color: 'red',   summary: 'Trainers below 70 on objection handling lose ~40% more deals.', action: 'Run a 30-min role-play this week.' },
    { type: 'warning', icon: '⚠️', title: `${planLabel}: Lowest performer needs a 1:1`,           tag: 'Trainer alert', tag_color: 'amber', summary: 'Bottom trainer is 12pts below team avg in 2 weeks.',           action: 'Schedule coaching session.' },
    { type: 'tip',     icon: '💡', title: `${planLabel}: Top performer\'s discovery is replicable`, tag: 'Best practices', tag_color: 'blue',  summary: 'Top trainer asks 3+ open questions before any pitch.',          action: 'Share top performer clip in next team meeting.' },
    { type: 'positive',icon: '📈', title: `${planLabel}: Close rate trending up 6 weeks`,         tag: 'ROI signal',     tag_color: 'green', summary: 'Coaching engagement correlates with +5–9pp close-rate gain.',   action: 'Keep the cadence.' },
  ]
  for (const ins of insights) {
    const { error } = await supabase.from('insights').insert({ org_id: orgId, ...ins })
    if (error) console.warn(`  ⚠ insights insert failed: ${error.message}`)
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== AskMoses.AI — Multi-tenant 3 Clients setup ===\n')
  console.log('Pré-requisitos: 012, 013, 018, 019 já aplicados no Supabase SQL Editor.\n')

  // Step 1a — Owners primeiro (auth user + public.users + public.owners)
  // owners.id é o que trainers.owner_id referencia (FK), não users.id
  const ownerRecordIdByOrg = {}
  for (const u of NEW_USERS.filter((x) => x.role === 'owner')) {
    console.log(`→ ${u.email} (owner, ${u.orgId.slice(-3)})`)
    try {
      const userId = await createAuthUser(u)
      await upsertProfile(userId, u.role, u.orgId)
      await upsertPublicUser(userId, u)
      const orgMeta = ORG_LABEL[u.orgId]
      const ownerRecordId = await upsertOwnerRecord(userId, orgMeta.company, orgMeta.plan)
      ownerRecordIdByOrg[u.orgId] = ownerRecordId
      console.log(`  ✓ user ${userId} + owner record ${ownerRecordId}`)
    } catch (err) {
      console.error(`  ✗ ${err.message}`)
    }
  }

  // Step 1b — Trainers, vinculados ao owner record do seu org
  const trainerIdByEmail = {}
  for (const u of NEW_USERS.filter((x) => x.role === 'trainer')) {
    console.log(`→ ${u.email} (trainer, ${u.orgId.slice(-3)})`)
    try {
      const userId = await createAuthUser(u)
      await upsertProfile(userId, u.role, u.orgId)
      await upsertPublicUser(userId, u)
      const ownerRecordId = ownerRecordIdByOrg[u.orgId]
      if (!ownerRecordId) throw new Error(`No owners.id captured for org ${u.orgId}`)
      const trainerId = await upsertTrainer(userId, u.orgId, ownerRecordId, u.trainerStats)
      if (trainerId) trainerIdByEmail[u.email] = { trainerId, userId, ...u }
      console.log(`  ✓ ${userId}${trainerId ? ` (trainer ${trainerId})` : ''}`)
    } catch (err) {
      console.error(`  ✗ ${err.message}`)
    }
  }

  // Step 2 — Rubrics + criteria for new orgs
  console.log('\n→ Rubrics + criteria for new orgs')
  await ensureRubric(ORG_K9_ELITE)
  await ensureRubric(ORG_PAW_ACADEMY)
  console.log('  ✓ rubrics seeded')

  // Step 3 — Calls for new trainers
  console.log('\n→ Calls')
  const rubricElite = RUBRIC_BY_ORG[ORG_K9_ELITE].id
  const rubricPaw   = RUBRIC_BY_ORG[ORG_PAW_ACADEMY].id
  const today = new Date('2026-04-22T10:00:00Z')

  // K9 Elite Training (Pro+RAG) — high performers
  const eliteTrainers = NEW_USERS.filter((u) => u.orgId === ORG_K9_ELITE && u.role === 'trainer')
  for (const u of eliteTrainers) {
    const reg = trainerIdByEmail[u.email]
    if (!reg) continue
    const rows = callsForTrainer(ORG_K9_ELITE, reg.trainerId, u.name, u.email, rubricElite, 'high', today, 5)
    await insertCalls(rows)
    console.log(`  ✓ ${u.name}: ${rows.length} calls (high)`)
  }

  // Paw Academy (Starter) — mid/low performers
  const pawTrainers = NEW_USERS.filter((u) => u.orgId === ORG_PAW_ACADEMY && u.role === 'trainer')
  for (let i = 0; i < pawTrainers.length; i++) {
    const u = pawTrainers[i]
    const reg = trainerIdByEmail[u.email]
    if (!reg) continue
    const level = i < 2 ? 'mid' : 'low'
    const rows = callsForTrainer(ORG_PAW_ACADEMY, reg.trainerId, u.name, u.email, rubricPaw, level, today, 5)
    await insertCalls(rows)
    console.log(`  ✓ ${u.name}: ${rows.length} calls (${level})`)
  }

  // Step 4 — Insights for new orgs
  console.log('\n→ Insights')
  await seedInsights(ORG_K9_ELITE,    'K9 Elite')
  await seedInsights(ORG_PAW_ACADEMY, 'Paw Academy')
  console.log('  ✓ insights seeded')

  console.log('\n✅ Setup completo.\n')
  console.log('Logins disponíveis:')
  for (const u of NEW_USERS) console.log(`   ${u.email} / ${PASSWORD}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
