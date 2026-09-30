import {
  formatPreviewReport,
  parsePreviewArgs,
  runWeeklyPreview,
} from '@/lib/script-intelligence/weekly-preview'

// Preview da sugestão semanal de script com o mesmo código do cron
// (lib/script-intelligence/weekly-preview.ts). Precisa, no ambiente:
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OPENAI_API_KEY; no
// --send-to também NEXT_PUBLIC_APP_URL e INTERNAL_API_SECRET (disparo da
// análise de Script Intelligence da org de teste).
//
//   npx tsx scripts/preview-weekly-suggestion.mts                    (dry-run: só imprime)
//   npx tsx scripts/preview-weekly-suggestion.mts --send-to <orgId>  (grava e envia; só org is_demo)

const args = parsePreviewArgs(process.argv.slice(2))
if ('error' in args) {
  console.error(args.error)
  process.exit(1)
}

console.log(args.mode === 'dry-run'
  ? '[DRY RUN] nada será gravado.\n'
  : `[SEND-TO ${args.orgId}] grava o script (org_id = essa org) e envia como pending só para ela.\n`)

const outcome = await runWeeklyPreview(args)

if (outcome.status === 'refused') {
  console.error(`RECUSADO: ${outcome.reason}`)
  process.exit(1)
}

console.log(formatPreviewReport(outcome.draft))

if (outcome.status === 'sent') {
  console.log(`\nEnviado. script_id ${outcome.scriptId} · script_suggestion_runs ${outcome.runId ?? '(falha ao registrar)'} · source = manual_test`)
} else if (outcome.status === 'failed') {
  console.error(`\nFALHOU: ${outcome.error} · script_suggestion_runs ${outcome.runId ?? '(falha ao registrar)'}`)
  process.exitCode = 1
}
// Sem process.exit no sucesso: o disparo da análise (fetch fire-and-forget do
// sendScriptToOrgs) precisa terminar antes de o processo sair.
