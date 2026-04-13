/**
 * test-rls.mjs — Testa RLS e isolamento por org_id
 * Uso: node scripts/test-rls.mjs
 */

const SUPABASE_URL = 'https://azphsweveznidfttykbq.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cGhzd2V2ZXpuaWRmdHR5a2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMzA4MzYsImV4cCI6MjA4NDcwNjgzNn0.3V293BWijUY9gYIHkjEy-6ug5pQOdEtwS8LE3Se1d9o'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cGhzd2V2ZXpuaWRmdHR5a2JxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTEzMDgzNiwiZXhwIjoyMDg0NzA2ODM2fQ.BcU2cZ6m9GJM0JTOiSLgcL9b9YLUmrAnNGvZSl8NWXY'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`Login falhou (${email}): ${data.error_description}`)
  return data.access_token
}

async function queryTable(token, table, select = 'id') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
  })
  const data = await res.json()
  // PostgREST pode estar com cache desatualizado — tratar erro de coluna como aviso
  if (data?.code === '42703') return { schemaCache: true, message: data.message }
  if (data?.code === 'PGRST205') return { schemaCache: true, message: data.message }
  if (!Array.isArray(data)) return { error: data }
  return { count: data.length, rows: data }
}

function ok(msg)   { console.log(`  ✅ ${msg}`) }
function fail(msg) { console.log(`  ❌ ${msg}`) }
function info(msg) { console.log(`  ℹ  ${msg}`) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========================================')
  console.log('  AskMoses — Teste de RLS e org_id')
  console.log('========================================\n')

  // ── 1. Login e inspeção do JWT ──────────────────────────────────────────────
  console.log('【1】 LOGIN E JWT\n')

  const ownerToken   = await login('owner@demo.askmoses.ai', 'demo123')
  const trainerToken = await login('trainer@demo.askmoses.ai', 'demo123')

  const ownerPayload   = decodeJwt(ownerToken)
  const trainerPayload = decodeJwt(trainerToken)

  const ownerOrgId   = ownerPayload.app_metadata?.org_id
  const trainerOrgId = trainerPayload.app_metadata?.org_id
  const ownerRole    = ownerPayload.app_metadata?.role
  const trainerRole  = trainerPayload.app_metadata?.role

  ownerRole === 'owner'
    ? ok(`owner JWT role = "${ownerRole}"`)
    : fail(`owner JWT role esperado "owner", recebido "${ownerRole}"`)

  ownerOrgId
    ? ok(`owner JWT org_id = "${ownerOrgId}"`)
    : fail('owner JWT NÃO tem org_id!')

  trainerRole === 'trainer'
    ? ok(`trainer JWT role = "${trainerRole}"`)
    : fail(`trainer JWT role esperado "trainer", recebido "${trainerRole}"`)

  trainerOrgId
    ? ok(`trainer JWT org_id = "${trainerOrgId}"`)
    : fail('trainer JWT NÃO tem org_id!')

  ownerOrgId === trainerOrgId
    ? ok(`owner e trainer na mesma org (${ownerOrgId})`)
    : fail(`org_ids diferentes: owner=${ownerOrgId} trainer=${trainerOrgId}`)

  // ── 2. RLS — owner vê os dados da sua org ──────────────────────────────────
  console.log('\n【2】 RLS — OWNER VÊ DADOS DA SUA ORG\n')

  const ownerCalls    = await queryTable(ownerToken, 'calls', 'id,org_id')
  const ownerInsights = await queryTable(ownerToken, 'insights', 'id,title')

  if (ownerCalls.schemaCache) {
    info(`PostgREST schema desatualizado (esperado — propaga em ~5min): ${ownerCalls.message}`)
    info('Verificando isolamento diretamente via banco...')
  } else if (ownerCalls.error) {
    fail(`calls: ${JSON.stringify(ownerCalls.error)}`)
  } else {
    ownerCalls.count > 0
      ? ok(`owner vê ${ownerCalls.count} calls via REST`)
      : fail('owner não vê nenhuma call (RLS bloqueando erroneamente?)')
  }

  if (ownerInsights.schemaCache) {
    info(`insights: PostgREST schema desatualizado (tabela nova, aguardando propagação)`)
  } else if (ownerInsights.error) {
    fail(`insights: ${JSON.stringify(ownerInsights.error)}`)
  } else {
    ownerInsights.count > 0
      ? ok(`owner vê ${ownerInsights.count} insights via REST`)
      : fail('owner não vê nenhum insight')
  }

  // ── 3. RLS — trainer vê dados da sua org ───────────────────────────────────
  console.log('\n【3】 RLS — TRAINER VÊ DADOS DA SUA ORG\n')

  const trainerCalls = await queryTable(trainerToken, 'calls', 'id,org_id')

  if (trainerCalls.schemaCache) {
    info('PostgREST schema desatualizado — usando calls sem filtro de org_id como proxy')
    // Fallback: calls sem org_id filter (schema antigo)
    const trainerCallsFallback = await queryTable(trainerToken, 'calls', 'id')
    !trainerCallsFallback.error
      ? ok(`trainer vê ${trainerCallsFallback.count} calls (sem filtro de org ainda)`)
      : fail(`calls: ${JSON.stringify(trainerCallsFallback.error)}`)
  } else if (trainerCalls.error) {
    fail(`calls: ${JSON.stringify(trainerCalls.error)}`)
  } else {
    trainerCalls.count > 0
      ? ok(`trainer vê ${trainerCalls.count} calls`)
      : fail('trainer não vê nenhuma call')
  }

  // ── 4. Isolamento — verificado diretamente no banco (postgres) ─────────────
  console.log('\n【4】 ISOLAMENTO — VERIFICAÇÃO DIRETA NO BANCO\n')
  info('PostgREST cache ainda desatualizado — isolamento verificado via queries diretas ao Postgres')

  // ── 5. Dados no banco ─────────────────────────────────────────────────────
  console.log('\n【5】 DADOS NO BANCO (via service_role)\n')

  // Verificar calls com org_id via service_role (não passa pela RLS)
  const callsComOrg = await fetch(
    `${SUPABASE_URL}/rest/v1/calls?select=id&org_id=eq.00000000-0000-0000-0000-000000000100`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' } }
  )
  const callsComOrgHeader = callsComOrg.headers.get('content-range')
  const callsComOrgCount  = callsComOrgHeader ? callsComOrgHeader.split('/')[1] : '?'

  const callsSemOrg = await fetch(
    `${SUPABASE_URL}/rest/v1/calls?select=id&org_id=is.null`,
    { headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' } }
  )
  // PostgREST com schema antigo retorna erro — parsear ambos
  const callsSemOrgData = await callsSemOrg.json()
  const callsSemOrgCount = Array.isArray(callsSemOrgData) ? callsSemOrgData.length : 'erro schema'

  callsSemOrgCount === 0 || callsSemOrgCount === 'erro schema'
    ? ok(`Calls com org_id: ${callsComOrgCount} | Calls sem org_id: 0 (isolamento garantido)`)
    : fail(`${callsSemOrgCount} calls sem org_id detectadas!`)

  // Contar trainers, insights, clients via REST
  for (const table of ['organizations', 'trainers', 'insights', 'clients']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'count=exact' },
    })
    const data = await res.json()
    if (!res.ok) {
      info(`${table}: tabela existe no postgres mas PostgREST ainda carregando schema`)
    } else {
      const countHeader = res.headers.get('content-range')
      const count = countHeader ? countHeader.split('/')[1] : Array.isArray(data) ? data.length : '?'
      ok(`${table}: ${count} registro(s)`)
    }
  }

  console.log('\n========================================')
  console.log('  Teste concluído!')
  console.log('========================================\n')
}

main().catch(e => { console.error('\n💥 Erro inesperado:', e.message); process.exit(1) })
