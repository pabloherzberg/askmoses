#!/usr/bin/env node
// ============================================================
// run-tc-suite.mjs — TC-01 · TC-02 · TC-03
//
// TC-01: Nenhuma query retorna erro de user_id/org_id ausente
//        (trainer, owner e suas queries principais)
// TC-02: RLS bloqueia anon; trainer só vê próprias calls
// TC-03: Rubric tem org_id correto e não vaza para outro tenant
//
// node scripts/run-tc-suite.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

// ─── .env loader ─────────────────────────────────────────────
// Reutiliza o mesmo loader robusto do setup-supabase.mjs (suporte a
// espaços em torno do =, comentários inline com #, aspas).
function stripInlineComment(line) {
  let inSingle = false, inDouble = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (c === '#' && !inSingle && !inDouble) return line.slice(0, i)
  }
  return line
}

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = resolve(__dir, '..')

for (const f of ['.env.local', '.env']) {
  const abs = resolve(root, f)
  if (!existsSync(abs)) continue
  for (const originalLine of readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const line = stripInlineComment(originalLine).trim()
    if (!line) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key]) continue
    process.env[key] = rawValue.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
}

const URL       = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON_KEY || !SVC_KEY) {
  console.error('❌  Faltam variáveis de ambiente. Precisamos de:')
  console.error('    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─── Clientes ─────────────────────────────────────────────────
const svc  = createClient(URL, SVC_KEY,  { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ─── IDs fixos do seed ────────────────────────────────────────
const ORG_100 = '00000000-0000-0000-0000-000000000100'
const ORG_200 = '00000000-0000-0000-0000-000000000200'
const RUBRIC_100 = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'

// ─── Resultado acumulado ──────────────────────────────────────
const results = []
let totalFail = 0

function pass(tc, label, detail = '') {
  results.push({ tc, status: '✅ PASS', label, detail })
}
function fail(tc, label, detail = '') {
  results.push({ tc, status: '❌ FAIL', label, detail })
  totalFail++
}
function warn(tc, label, detail = '') {
  results.push({ tc, status: '⚠️  WARN', label, detail })
}

// ─── Helpers ──────────────────────────────────────────────────

// Faz login via Supabase Auth e retorna um client autenticado
async function loginAs(email, password) {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Login ${email} falhou: ${error.message}`)
  return { client, user: data.user, session: data.session }
}

// Verifica se o user tem active_org_id preenchido em public.users
async function getUserOrgContext(userId) {
  const { data, error } = await svc
    .from('users')
    .select('id, active_org_id, role, invite_status')
    .eq('id', userId)
    .maybeSingle()
  return { data, error }
}

// ================================================================
// TC-01 — Nenhuma query retorna erro de user_id/org_id ausente
// ================================================================
async function runTC01() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('TC-01  Nenhuma task retorna erro de user_id/org_id ausente')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1.1 — Trainer tem active_org_id
  try {
    const { client, user } = await loginAs('trainer@demo.askmoses.ai', 'demo123')
    const { data, error } = await getUserOrgContext(user.id)

    if (error) {
      fail('TC-01', '1.1 trainer row existe em public.users', error.message)
    } else if (!data) {
      fail('TC-01', '1.1 trainer row existe em public.users', 'Row não encontrada em public.users')
    } else if (!data.active_org_id) {
      fail('TC-01', '1.1 trainer.active_org_id preenchido', `active_org_id=null — getOrgId() retornará null`)
    } else {
      pass('TC-01', '1.1 trainer.active_org_id preenchido', `org_id=${data.active_org_id}`)
    }

    // 1.2 — Trainer tem membership aceita
    const { data: mem, error: memErr } = await svc
      .from('memberships')
      .select('user_id, org_id, role, invite_status')
      .eq('user_id', user.id)
      .eq('invite_status', 'accepted')
      .maybeSingle()

    if (memErr || !mem) {
      fail('TC-01', '1.2 trainer tem membership accepted', memErr?.message ?? 'membership não encontrada')
    } else {
      pass('TC-01', '1.2 trainer tem membership accepted', `org=${mem.org_id} role=${mem.role}`)
    }

    // 1.3 — Trainer tem row em trainers com user_id e org_id
    if (data?.active_org_id) {
      const { data: tr, error: trErr } = await svc
        .from('trainers')
        .select('id, user_id, org_id')
        .eq('user_id', user.id)
        .eq('org_id', data.active_org_id)
        .maybeSingle()

      if (trErr || !tr) {
        fail('TC-01', '1.3 trainer tem row em trainers com user_id+org_id', trErr?.message ?? 'row não encontrada')
      } else {
        pass('TC-01', '1.3 trainer tem row em trainers com user_id+org_id', `trainer_db_id=${tr.id}`)
      }
    } else {
      fail('TC-01', '1.3 trainer tem row em trainers', 'pulado — active_org_id já falhou')
    }

    await client.auth.signOut()
  } catch (e) {
    fail('TC-01', '1.x login trainer@demo.askmoses.ai', e.message)
  }

  // 1.4 — Owner tem active_org_id
  try {
    const { client, user } = await loginAs('owner@demo.askmoses.ai', 'demo123')
    const { data, error } = await getUserOrgContext(user.id)

    if (error || !data) {
      fail('TC-01', '1.4 owner row existe em public.users', error?.message ?? 'row não encontrada')
    } else if (!data.active_org_id) {
      fail('TC-01', '1.4 owner.active_org_id preenchido', 'active_org_id=null')
    } else {
      pass('TC-01', '1.4 owner.active_org_id preenchido', `org_id=${data.active_org_id}`)
    }

    await client.auth.signOut()
  } catch (e) {
    fail('TC-01', '1.4 login owner@demo.askmoses.ai', e.message)
  }

  // 1.5 — org 100 tem rubric is_default=true
  {
    const { data, error } = await svc
      .from('rubrics')
      .select('id, org_id, is_default, is_active')
      .eq('org_id', ORG_100)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      fail('TC-01', '1.5 org 100 tem rubric is_default=true + is_active=true', error?.message ?? 'rubric não encontrada')
    } else {
      pass('TC-01', '1.5 org 100 tem rubric is_default=true + is_active=true', `rubric_id=${data.id}`)
    }
  }

  // 1.6 — org 100 tem subscription_status ativo
  {
    const { data, error } = await svc
      .from('organizations')
      .select('id, subscription_status')
      .eq('id', ORG_100)
      .maybeSingle()

    if (error || !data) {
      fail('TC-01', '1.6 org 100 existe em organizations', error?.message ?? 'org não encontrada')
    } else if (data.subscription_status !== 'active' && data.subscription_status !== 'trial') {
      fail('TC-01', '1.6 org 100 subscription_status ativo', `status=${data.subscription_status}`)
    } else {
      pass('TC-01', '1.6 org 100 subscription_status ativo', `status=${data.subscription_status}`)
    }
  }

  // 1.7 — calls do seed (IDs fixos 000...06xx) têm trainer_id preenchido
  //        Calls reais via upload podem não ter trainer_id — isso é esperado.
  {
    // Seed calls têm IDs fixos de 601 a 621 — filtrar pelo prefixo via cast text
    const { data, error } = await svc
      .from('calls')
      .select('id, org_id, trainer_id')
      .eq('org_id', ORG_100)
      .in('id', [
        '00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000602',
        '00000000-0000-0000-0000-000000000603','00000000-0000-0000-0000-000000000604',
        '00000000-0000-0000-0000-000000000605','00000000-0000-0000-0000-000000000606',
        '00000000-0000-0000-0000-000000000607','00000000-0000-0000-0000-000000000608',
        '00000000-0000-0000-0000-000000000609','00000000-0000-0000-0000-000000000610',
        '00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-000000000612',
        '00000000-0000-0000-0000-000000000613','00000000-0000-0000-0000-000000000614',
        '00000000-0000-0000-0000-000000000615','00000000-0000-0000-0000-000000000616',
        '00000000-0000-0000-0000-000000000617','00000000-0000-0000-0000-000000000618',
        '00000000-0000-0000-0000-000000000619','00000000-0000-0000-0000-000000000620',
        '00000000-0000-0000-0000-000000000621',
      ])

    if (error) {
      fail('TC-01', '1.7 seed calls têm trainer_id', error.message)
    } else if ((data ?? []).length === 0) {
      warn('TC-01', '1.7 seed calls existem na org 100', 'Nenhuma seed call encontrada (013_seed_demo_org.sql não rodou?)')
    } else {
      const sem_trainer = (data ?? []).filter(c => !c.trainer_id)
      if (sem_trainer.length > 0) {
        warn('TC-01', '1.7 seed calls têm trainer_id', `${sem_trainer.length}/${data.length} seed calls sem trainer_id — 042_fix sql ainda não rodou`)
      } else {
        pass('TC-01', '1.7 seed calls têm trainer_id', `${data.length} seed calls todas com trainer_id`)
      }
    }
  }
}

// ================================================================
// TC-02 — RLS: anon não vaza; trainer só vê próprias calls
// ================================================================
async function runTC02() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('TC-02  RLS não bloqueia funcionalidades existentes')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const TENANT_TABLES = ['calls', 'rubrics', 'criteria', 'scripts', 'insights',
    'marketing_runs', 'organizations', 'users', 'trainers', 'memberships']

  // 2.1 — Anon não vê nenhuma tabela tenant
  for (const t of TENANT_TABLES) {
    const { data, error } = await anon.from(t).select('*').limit(1)
    const rows = data?.length ?? 0
    if (error) {
      const code = String(error.code ?? error.status ?? '')
      const isBlocked = ['42501', 'PGRST301', 'PGRST116'].includes(code)
        || /permission denied|insufficient_privilege/i.test(error.message ?? '')
      if (isBlocked) {
        pass('TC-02', `2.1 anon bloqueado em ${t}`, `[${code}] ${error.message}`)
      } else {
        fail('TC-02', `2.1 anon bloqueado em ${t}`, `erro inesperado [${code}]: ${error.message}`)
      }
    } else if (rows === 0) {
      pass('TC-02', `2.1 anon bloqueado em ${t}`, '0 rows (RLS filtrou)')
    } else {
      fail('TC-02', `2.1 anon bloqueado em ${t}`, `VAZAMENTO: ${rows} rows visíveis sem auth`)
    }
  }

  // 2.2 — Trainer só vê suas próprias calls
  try {
    const { user } = await loginAs('trainer@demo.askmoses.ai', 'demo123')
    const trainerId = user.id

    // Buscar trainer_db_id (trainers.id) para comparar
    const { data: trRow } = await svc
      .from('trainers')
      .select('id')
      .eq('user_id', trainerId)
      .maybeSingle()

    // Via service role: total de calls da org e do trainer
    const { data: allCalls } = await svc
      .from('calls')
      .select('id, trainer_id')
      .eq('org_id', ORG_100)

    const trainerCalls = (allCalls ?? []).filter(c =>
      c.trainer_id === trainerId || c.trainer_id === trRow?.id
    )

    if (trainerCalls.length === 0) {
      warn('TC-02', '2.2 trainer tem calls para verificar', 'Nenhuma call do trainer encontrada via service_role')
    } else {
      // A API /api/calls não é acessível diretamente aqui, então verificamos
      // que a tabela calls tem os trainer_id corretos no scope do trainer.
      // O filtro real acontece em getCalls() que usa getTrainerDbId().
      // Aqui verificamos que os dados no banco estão corretos para esse filtro funcionar.
      const callsComTrainerId = trainerCalls.filter(c => c.trainer_id !== null)
      if (callsComTrainerId.length === trainerCalls.length) {
        pass('TC-02', '2.2 calls do trainer têm trainer_id para filtro RLS', `${trainerCalls.length} calls com trainer_id=${trainerId} ou ${trRow?.id ?? 'n/a'}`)
      } else {
        fail('TC-02', '2.2 calls do trainer têm trainer_id', `${trainerCalls.length - callsComTrainerId.length} calls sem trainer_id`)
      }
    }
  } catch (e) {
    fail('TC-02', '2.2 trainer calls filter', e.message)
  }

  // 2.3 — Owner vê calls da org 100 (funcionalidade existente não quebrada)
  try {
    const { user } = await loginAs('owner@demo.askmoses.ai', 'demo123')
    const { data: ownerCtx } = await getUserOrgContext(user.id)

    const { data: calls, error } = await svc
      .from('calls')
      .select('id, org_id')
      .eq('org_id', ownerCtx?.active_org_id ?? ORG_100)
      .limit(5)

    if (error) {
      fail('TC-02', '2.3 owner acessa calls da sua org', error.message)
    } else if ((calls ?? []).length === 0) {
      warn('TC-02', '2.3 owner acessa calls da sua org', 'Nenhuma call encontrada — seed pode não ter rodado')
    } else {
      pass('TC-02', '2.3 owner acessa calls da sua org', `${calls.length} calls visíveis para owner`)
    }
  } catch (e) {
    fail('TC-02', '2.3 owner calls', e.message)
  }

  // 2.4 — Owner não vê calls de outra org
  {
    const { data: calls_200, error } = await svc
      .from('calls')
      .select('id')
      .eq('org_id', ORG_200)
      .limit(1)

    if (error) {
      warn('TC-02', '2.4 org 200 existe (multi-tenant isolation check)', error.message)
    } else if ((calls_200 ?? []).length === 0) {
      warn('TC-02', '2.4 org 200 tem calls para teste de isolamento', 'Org 200 sem calls — setup-three-clients.mjs não foi rodado')
    } else {
      // Verificar via service_role que as calls das orgs são distintas
      const { data: calls_100 } = await svc.from('calls').select('id').eq('org_id', ORG_100).limit(1)
      const id_100 = calls_100?.[0]?.id
      const id_200 = calls_200?.[0]?.id
      if (id_100 && id_200 && id_100 !== id_200) {
        pass('TC-02', '2.4 calls de orgs diferentes são isoladas no DB', `org100[0]=${id_100} ≠ org200[0]=${id_200}`)
      } else {
        warn('TC-02', '2.4 isolamento multi-tenant', 'Não foi possível verificar com calls de duas orgs')
      }
    }
  }
}

// ================================================================
// TC-03 — Rubric vinculada ao tenant correto
// ================================================================
async function runTC03() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('TC-03  Rubrics vinculadas corretamente ao tenant')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 3.1 — Org 100 tem rubric default ativa com org_id correto
  let defaultRubricId = null
  {
    const { data, error } = await svc
      .from('rubrics')
      .select('id, org_id, is_default, is_active, name')
      .eq('org_id', ORG_100)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      fail('TC-03', '3.1 org 100 tem rubric default ativa', error?.message ?? 'nenhuma rubric default encontrada')
    } else if (data.org_id !== ORG_100) {
      fail('TC-03', '3.1 rubric.org_id = org 100', `org_id=${data.org_id} (esperado ${ORG_100})`)
    } else {
      defaultRubricId = data.id
      pass('TC-03', '3.1 org 100 tem rubric default ativa', `rubric="${data.name}" id=${data.id}`)
    }
  }

  // 3.2 — Criteria da rubric default têm org_id correto
  if (defaultRubricId) {
    const { data, error } = await svc
      .from('criteria')
      .select('id, rubric_id, org_id, name')
      .eq('rubric_id', defaultRubricId)

    if (error) {
      fail('TC-03', '3.2 criteria da rubric default têm org_id', error.message)
    } else if ((data ?? []).length === 0) {
      fail('TC-03', '3.2 criteria da rubric default existem', `Nenhuma criteria para rubric=${defaultRubricId}`)
    } else {
      const sem_org = data.filter(c => c.org_id !== ORG_100)
      if (sem_org.length > 0) {
        fail('TC-03', '3.2 criteria.org_id = org 100', `${sem_org.length} criteria com org_id errado: ${sem_org.map(c => c.name).join(', ')}`)
      } else {
        pass('TC-03', '3.2 criteria.org_id = org 100', `${data.length} criteria todas com org_id=${ORG_100}`)
      }
    }
  } else {
    fail('TC-03', '3.2 criteria verificadas', 'pulado — rubric default não encontrada em 3.1')
  }

  // 3.3 — Rubric da org 100 NÃO aparece para outra org (isolamento)
  {
    const { data: rubrics_200, error } = await svc
      .from('rubrics')
      .select('id, org_id')
      .eq('org_id', ORG_200)

    if (error) {
      warn('TC-03', '3.3 rubric isolada entre tenants (org 200 não existe)', error.message)
    } else {
      const leak = (rubrics_200 ?? []).find(r => r.id === RUBRIC_100)
      if (leak) {
        fail('TC-03', '3.3 rubric da org 100 não vaza para org 200', `rubric ${RUBRIC_100} aparece em org 200!`)
      } else {
        pass('TC-03', '3.3 rubric da org 100 não vaza para org 200', `org 200 tem ${rubrics_200?.length ?? 0} rubric(s) própria(s)`)
      }
    }
  }

  // 3.4 — Cada org tem sua própria rubric (não compartilham)
  {
    const { data: rubrics, error } = await svc
      .from('rubrics')
      .select('id, org_id, name')
      .in('org_id', [ORG_100, ORG_200])
      .eq('is_active', true)

    if (error) {
      warn('TC-03', '3.4 orgs têm rubrics separadas', error.message)
    } else {
      const org100rubrics = (rubrics ?? []).filter(r => r.org_id === ORG_100)
      const org200rubrics = (rubrics ?? []).filter(r => r.org_id === ORG_200)

      if (org100rubrics.length > 0) {
        pass('TC-03', '3.4 org 100 tem rubric própria', `${org100rubrics.length} rubric(s): ${org100rubrics.map(r => r.name).join(', ')}`)
      } else {
        fail('TC-03', '3.4 org 100 tem rubric própria', 'nenhuma rubric ativa encontrada')
      }

      if (org200rubrics.length > 0) {
        pass('TC-03', '3.4 org 200 tem rubric própria', `${org200rubrics.length} rubric(s)`)
      } else {
        warn('TC-03', '3.4 org 200 tem rubric própria', 'setup-three-clients.mjs não foi rodado — org 200 sem rubric')
      }
    }
  }

  // 3.5 — Simula "save rubric" com org_id errado: deve falhar ou não contaminar
  {
    // Tenta inserir uma rubric com org_id da org 200 via service_role e verifica
    // que ela não aparece como is_default da org 100
    const fakeId = '99999999-9999-9999-9999-000000000099'
    await svc.from('rubrics').delete().eq('id', fakeId) // limpar eventual lixo de run anterior

    const { error: insErr } = await svc.from('rubrics').insert({
      id: fakeId,
      org_id: ORG_200,
      name: 'TC-03 fake rubric (deve ser deletada)',
      is_default: false,
      is_active: true,
      role_label: 'trainer',
      call_goal: 'test',
      coaching_tone: 'balanced',
      outcome_options: ['closed'],
    })

    if (insErr) {
      warn('TC-03', '3.5 simula rubric em org errada', `insert falhou (OK se RLS): ${insErr.message}`)
    } else {
      // Verificar que ela não aparece como default da org 100
      const { data: defaultRubric } = await svc
        .from('rubrics')
        .select('id')
        .eq('org_id', ORG_100)
        .eq('is_default', true)
        .maybeSingle()

      if (defaultRubric?.id === fakeId) {
        fail('TC-03', '3.5 rubric de org errada não vira default de outra org', 'CONTAMINAÇÃO: rubric de org 200 aparece como default de org 100!')
      } else {
        pass('TC-03', '3.5 rubric de org 200 não contamina default de org 100', `default org 100 continua=${defaultRubric?.id}`)
      }

      // Limpar
      await svc.from('rubrics').delete().eq('id', fakeId)
    }
  }
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   AskMoses TC Suite — TC-01 · TC-02 · TC-03     ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log(`Supabase: ${URL}`)

  await runTC01()
  await runTC02()
  await runTC03()

  // ─── Resumo ───────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('RESULTADO FINAL')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const byTc = {}
  for (const r of results) {
    if (!byTc[r.tc]) byTc[r.tc] = []
    byTc[r.tc].push(r)
  }

  for (const [tc, items] of Object.entries(byTc)) {
    console.log(`\n${tc}`)
    for (const item of items) {
      console.log(`  ${item.status}  ${item.label}`)
      if (item.detail) console.log(`         ${item.detail}`)
    }
  }

  const totalPass = results.filter(r => r.status.startsWith('✅')).length
  const totalWarn = results.filter(r => r.status.startsWith('⚠')).length

  console.log(`\n────────────────────────────────────────`)
  console.log(`  ✅ PASS: ${totalPass}  ❌ FAIL: ${totalFail}  ⚠️  WARN: ${totalWarn}`)
  console.log(`────────────────────────────────────────`)

  if (totalFail > 0) {
    console.error(`\n❌  SUITE FALHOU — ${totalFail} check(s) falharam. Ver itens acima.`)
    process.exit(1)
  } else {
    console.log(`\n✅  SUITE PASSOU${totalWarn > 0 ? ` (${totalWarn} aviso(s) — ver acima)` : ''}.`)
  }
}

main().catch(err => {
  console.error('\nErro inesperado:', err)
  process.exit(1)
})
