import {
  WEEKLY_CRON_MAX_DURATION_S,
  formatPreviewReport,
  parsePreviewArgs,
  runWeeklyPreview,
} from '@/lib/script-intelligence/weekly-preview'
import { WEEKLY_DEFAULT_MODEL } from '@/lib/script-intelligence/weekly-suggestion'

// Preview da sugestão semanal de script com o mesmo código do cron
// (lib/script-intelligence/weekly-preview.ts). Precisa, no ambiente:
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OPENAI_API_KEY; no
// --send-to também NEXT_PUBLIC_APP_URL e INTERNAL_API_SECRET (disparo da
// análise de Script Intelligence da org de teste).
//
//   npx tsx scripts/preview-weekly-suggestion.mts                    (dry-run: só imprime)
//   npx tsx scripts/preview-weekly-suggestion.mts --send-to <orgId>  (grava e envia; só org is_demo)
//   … --model <id>   (qualquer modo; id do catálogo OpenAI. Padrão: o do cron)

const args = parsePreviewArgs(process.argv.slice(2))
if ('error' in args) {
  console.error(args.error)
  process.exit(1)
}

console.log(args.mode === 'dry-run'
  ? '[DRY RUN] nada será gravado.'
  : `[SEND-TO ${args.orgId}] grava o script (org_id = essa org) e envia como pending só para ela.`)
console.log(`Modelo: ${args.model ?? `${WEEKLY_DEFAULT_MODEL} (o do cron)`}\n`)

const startedAt = Date.now()
const outcome = await runWeeklyPreview(args)
const totalS = (Date.now() - startedAt) / 1000

if (outcome.status === 'refused') {
  console.error(`RECUSADO: ${outcome.reason}`)
  process.exit(1)
}

console.log(formatPreviewReport(outcome.draft))
// No dry-run, total = seleção + IA + anonimização (o que o cron faz antes de
// gravar e enviar). A rede daqui para Supabase/OpenAI não é a da Vercel.
console.log(
  `\nTempo total: ${totalS.toFixed(1)}s de ${WEEKLY_CRON_MAX_DURATION_S}s (maxDuration do cron)` +
    ` → folga ${(WEEKLY_CRON_MAX_DURATION_S - totalS).toFixed(1)}s` +
    ` (${Math.round((totalS / WEEKLY_CRON_MAX_DURATION_S) * 100)}% do teto)`,
)

if (outcome.status === 'sent') {
  console.log(`\nEnviado. script_id ${outcome.scriptId} · script_suggestion_runs ${outcome.runId ?? '(falha ao registrar)'} · source = manual_test`)
} else if (outcome.status === 'failed') {
  console.error(`\nFALHOU: ${outcome.error} · script_suggestion_runs ${outcome.runId ?? '(falha ao registrar)'}`)
  process.exitCode = 1
}
// Sem process.exit no sucesso: o disparo da análise (fetch fire-and-forget do
// sendScriptToOrgs) precisa terminar antes de o processo sair.
