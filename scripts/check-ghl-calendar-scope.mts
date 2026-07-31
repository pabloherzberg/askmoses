import { createClient } from '@supabase/supabase-js'

// Diagnóstico: quais orgs têm o PIT com escopo `calendars/events.readonly`?
//
// Por que existe: o escopo é marcado MANUALMENTE na Private Integration de cada
// sub-account do Pepper, uma por cliente. Não dá pra saber pelo nosso banco quem
// marcou e quem não — o PIT é opaco, guardamos só a string do token. A única
// forma confiável é PERGUNTAR pro GHL: fazer uma chamada barata ao endpoint de
// agenda e ler o status.
//
//   200/404 → escopo OK   (404 = contato sem agenda; a autorização passou)
//   401/403 → escopo FALTANDO (ou PIT rotacionado/inválido)
//
// Read-only: não grava nada, não altera o PIT de ninguém.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/check-ghl-calendar-scope.mts
//   npx tsx --env-file=.env.local scripts/check-ghl-calendar-scope.mts <ORG_ID>

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const API_BASE = (process.env.GHL_API_BASE ?? 'https://services.leadconnectorhq.com').replace(/\/+$/, '')
const API_VERSION = '2021-04-15'
const ORG_ID = process.argv.slice(2).find((a) => !a.startsWith('--'))

let query = supabase
  .from('organizations')
  .select('id, name, ghl_location_id, ghl_access_token, ghl_integration_enabled')
  .eq('ghl_integration_enabled', true)

if (ORG_ID) query = query.eq('id', ORG_ID)

const { data: orgs, error } = await query

if (error) {
  console.error('org query failed:', error.message)
  process.exit(1)
}
if (!orgs || orgs.length === 0) {
  console.error(ORG_ID ? `Org ${ORG_ID} não encontrada ou com GHL desabilitado.` : 'Nenhuma org com GHL habilitado.')
  process.exit(1)
}

console.log(`Verificando escopo calendars/events.readonly em ${orgs.length} org(s)...\n`)

type Verdict = 'OK' | 'MISSING_SCOPE' | 'NO_CREDENTIALS' | 'NO_CONTACTS' | 'ERROR'

const results: { name: string; orgId: string; verdict: Verdict; detail: string }[] = []

for (const org of orgs) {
  const name = (org.name as string | null) ?? '(sem nome)'
  const orgId = org.id as string
  const token = org.ghl_access_token as string | null

  if (!token || !org.ghl_location_id) {
    results.push({ name, orgId, verdict: 'NO_CREDENTIALS', detail: 'PIT ou locationId ausente no banco' })
    continue
  }

  // Precisa de um contactId real da org — o endpoint de sondagem é por contato.
  // Qualquer call ingerida serve; é só pra ter um alvo válido pro GHL avaliar.
  const { data: call } = await supabase
    .from('calls')
    .select('contact_id')
    .eq('org_id', orgId)
    .not('contact_id', 'is', null)
    .limit(1)
    .maybeSingle()

  const contactId = (call?.contact_id as string | null) ?? null
  if (!contactId) {
    results.push({
      name,
      orgId,
      verdict: 'NO_CONTACTS',
      detail: 'Sem call com contact_id — nada pra sondar (e nada que o cron fosse varrer)',
    })
    continue
  }

  try {
    const res = await fetch(`${API_BASE}/contacts/${encodeURIComponent(contactId)}/appointments`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: 'application/json',
      },
    })

    if (res.status === 401 || res.status === 403) {
      const body = await res.text()
      results.push({
        name,
        orgId,
        verdict: 'MISSING_SCOPE',
        detail: `HTTP ${res.status} — ${body.slice(0, 120)}`,
      })
    } else if (res.ok || res.status === 404) {
      // 404 aqui é sucesso de autorização: o GHL avaliou o escopo antes de
      // decidir que o contato não tem agenda.
      let count = 0
      if (res.ok) {
        const json = (await res.json()) as { events?: unknown[]; appointments?: unknown[] }
        const list = Array.isArray(json.events) ? json.events : Array.isArray(json.appointments) ? json.appointments : []
        count = list.length
      }
      results.push({
        name,
        orgId,
        verdict: 'OK',
        detail: res.ok ? `${count} agendamento(s) no contato sondado` : 'contato sem agenda (autorização passou)',
      })
    } else {
      const body = await res.text()
      results.push({ name, orgId, verdict: 'ERROR', detail: `HTTP ${res.status} — ${body.slice(0, 120)}` })
    }
  } catch (err) {
    results.push({ name, orgId, verdict: 'ERROR', detail: err instanceof Error ? err.message : String(err) })
  }
}

const ICON: Record<Verdict, string> = {
  OK: '✅',
  MISSING_SCOPE: '❌',
  NO_CREDENTIALS: '⚠️ ',
  NO_CONTACTS: '➖',
  ERROR: '⚠️ ',
}

for (const r of results) {
  console.log(`${ICON[r.verdict]} ${r.name.padEnd(32)} ${r.verdict.padEnd(15)} ${r.detail}`)
  console.log(`   org: ${r.orgId}`)
}

const missing = results.filter((r) => r.verdict === 'MISSING_SCOPE')
console.log(`\n${results.filter((r) => r.verdict === 'OK').length}/${results.length} org(s) com o escopo OK.`)

if (missing.length > 0) {
  console.log(`\n${missing.length} org(s) precisam do escopo marcado no Pepper:`)
  for (const m of missing) console.log(`  · ${m.name} — Settings → Private Integrations → marcar calendars/events.readonly`)
  console.log('\nSe o GHL reemitir o PIT ao salvar, colar o novo token em /admin/organizations/<id>/integrations/ghl.')
}
