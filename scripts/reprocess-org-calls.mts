/**
 * Reprocessa o outcome (closed/not_closed) das calls JÁ TRANSCRITAS de uma
 * org, rodando o novo prompt (buildDefaultSystemPrompt + sinal de
 * appointment) sem rebaixar/re-transcrever áudio — chama runGhlCallScoring
 * diretamente em cima do transcript salvo.
 *
 * Uso:
 *   npx tsx scripts/reprocess-org-calls.mts --org "Centurion K9" --dry-run
 *   npx tsx scripts/reprocess-org-calls.mts --org "Centurion K9"
 *
 * --dry-run lista as calls que seriam reprocessadas sem chamar o LLM.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { runGhlCallScoring } from '@/lib/services/ghl-call-scoring'

function parseArgs(argv: string[]) {
  const orgIdx = argv.indexOf('--org')
  const orgName = orgIdx >= 0 ? argv[orgIdx + 1] : null
  const dryRun = argv.includes('--dry-run')
  return { orgName, dryRun }
}

async function main() {
  const { orgName, dryRun } = parseArgs(process.argv.slice(2))
  if (!orgName) {
    console.error('Uso: npx tsx scripts/reprocess-org-calls.mts --org "<nome da org>" [--dry-run]')
    process.exit(1)
  }

  const admin = createAdminClient()

  const { data: orgs, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .ilike('name', `%${orgName}%`)

  if (orgErr) throw new Error(`Falha ao buscar org: ${orgErr.message}`)
  if (!orgs || orgs.length === 0) {
    console.error(`Nenhuma org encontrada com nome contendo "${orgName}"`)
    process.exit(1)
  }
  if (orgs.length > 1) {
    console.error(`Mais de uma org encontrada, seja mais específico:`, orgs)
    process.exit(1)
  }

  const org = orgs[0] as { id: string; name: string }
  console.log(`Org: ${org.name} (${org.id})`)

  const { data: calls, error: callsErr } = await admin
    .from('calls')
    .select('id, created_at, trainer_name, client_name, call_outcome, closed, is_sales_call')
    .eq('org_id', org.id)
    .not('transcript', 'is', null)
    .order('created_at', { ascending: true })

  if (callsErr) throw new Error(`Falha ao buscar calls: ${callsErr.message}`)
  if (!calls || calls.length === 0) {
    console.log('Nenhuma call com transcript encontrada para essa org.')
    return
  }

  console.log(`${calls.length} calls com transcript encontradas.`)

  if (dryRun) {
    console.table(
      calls.map((c) => ({
        id: c.id,
        created_at: c.created_at,
        trainer: c.trainer_name,
        client: c.client_name,
        call_outcome: c.call_outcome,
        closed: c.closed,
        is_sales_call: c.is_sales_call,
      })),
    )
    console.log('\n(dry-run — nenhuma call foi reprocessada)')
    return
  }

  let ok = 0
  let failed = 0
  for (const [i, c] of calls.entries()) {
    const call = c as { id: string; call_outcome: string | null }
    process.stdout.write(`[${i + 1}/${calls.length}] ${call.id} ... `)
    try {
      await runGhlCallScoring(call.id)
      ok += 1
      console.log('ok')
    } catch (err) {
      failed += 1
      const message = err instanceof Error ? err.message : String(err)
      console.log(`FALHOU: ${message}`)
    }
  }

  console.log(`\nConcluído: ${ok} reprocessadas, ${failed} falharam de ${calls.length}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
