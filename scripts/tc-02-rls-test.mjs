#!/usr/bin/env node
// ============================================================
// TC-02 — RLS test via REST API com anon key
//
// Complementa o tc-02-rls-test.sql (que roda dentro do Supabase Studio):
// aqui simulamos um cliente externo HTTP usando a anon key, que é o que
// um atacante teria se vazasse a NEXT_PUBLIC_SUPABASE_ANON_KEY (ela vive
// no bundle JS do frontend, então é trivial de extrair).
//
// Esperado: 0 rows em todas as tabelas tenant-scoped via REST sem login.
//
// Como rodar:
//   node scripts/tc-02-rls-test.mjs
//
// Env vars necessárias (carregadas via .env.local automaticamente):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

// Lê .env.local manual (sem dotenv) — mantém o script zero-deps além
// do supabase-js que já está no package.json.
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias.')
  process.exit(1)
}

// Client com anon key, sem session — mesmo contexto de um visitante
// não-logado batendo direto no /rest/v1/<table>.
const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TENANT_TABLES = [
  'calls',
  'rubrics',
  'criteria',
  'scripts',
  'insights',
  'marketing_runs',
  'organizations',
  'users',
  'trainers',
  'memberships',
  'owners',
  'invite_tokens',
  'admin_impersonations',
]

const PUBLIC_TABLES = ['plans']

// Códigos de erro que SIM contam como TC-02 OK numa tabela tenant-scoped:
// o banco rejeitou explicitamente o acesso anônimo (grants revogados / RLS).
//   42501    → insufficient_privilege (Postgres)
//   PGRST301 → JWT ausente/ inválido (PostgREST)
//   401/403  → HTTP status quando o supabase-js expõe `status`
// Qualquer outro erro (404 / tabela ausente / schema errado / rede) NÃO é
// pass — mascararia uma migration incompleta, então tratamos como falha.
const PERMISSION_ERROR_CODES = new Set(['42501', 'PGRST301', '401', '403'])

const results = []
let failures = 0

async function probe(table, expectEmpty) {
  const { data, error, count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: false })
    .limit(1)

  // Possíveis comportamentos:
  // 1) error de permissão (42501/PGRST301/401/403) → acesso negado — TC-02 OK
  // 2) data=[] count=0 → policy retornou vazio — TC-02 OK
  // 3) data com rows → VAZAMENTO — TC-02 FALHA
  // 4) error 404 / tabela ausente / rede → inconclusivo — TC-02 FALHA
  //    (não pode contar como pass: esconderia migration incompleta)
  if (error) {
    const code = String(error.code ?? error.status ?? '')
    const isPermissionError =
      PERMISSION_ERROR_CODES.has(code) || /permission denied/i.test(error.message ?? '')
    const ok = expectEmpty && isPermissionError
    results.push({
      table,
      status: ok ? '✅' : '❌',
      detail: `error [${code || '?'}]: ${error.message}`,
    })
    if (!ok) failures++
    return
  }

  const rows = data?.length ?? 0
  if (expectEmpty) {
    if (rows === 0) {
      results.push({ table, status: '✅', detail: `0 rows (RLS scoped)` })
    } else {
      results.push({ table, status: '❌ LEAK', detail: `${rows} rows visíveis sem auth (count=${count ?? '?'})` })
      failures++
    }
  } else {
    // Tabelas públicas (plans) devem retornar > 0 se houver dados seedados.
    results.push({ table, status: rows > 0 ? '✅' : '⚠️', detail: `${rows} rows (public_read)` })
  }
}

async function main() {
  console.log('TC-02 RLS Test (anon key via REST API)')
  console.log('=====================================')
  console.log(`URL: ${url}`)
  console.log('')

  console.log('▸ Tabelas tenant-scoped — esperado: 0 rows / 401 / 403')
  for (const t of TENANT_TABLES) {
    await probe(t, true)
  }

  console.log('')
  console.log('▸ Tabelas públicas (plans) — esperado: > 0 rows')
  for (const t of PUBLIC_TABLES) {
    await probe(t, false)
  }

  console.log('')
  console.log('Resultados:')
  for (const r of results) {
    console.log(`  ${r.status}  ${r.table.padEnd(24)} ${r.detail}`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`❌ TC-02 FALHOU: ${failures} tabela(s) com vazamento.`)
    process.exit(1)
  } else {
    console.log('✅ TC-02 PASSOU: nenhuma tabela tenant vazou via anon key.')
  }
}

main().catch((err) => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
