// ============================================================
// patch-custom-system-prompts.mts
//
// Acrescenta a seção "SALES CALL GATE" (o mesmo texto adicionado a
// buildDefaultSystemPrompt() em lib/services/scoring.ts e
// app/api/analyze/route.ts) ao final de todo rubrics.system_prompt
// customizado (não-null) já existente no banco.
//
// Não existe migration/seed que define system_prompt customizado por
// org — são dados de runtime, setados via Settings/Admin (dbUpdateRubric).
// Por isso este é um script manual e não uma migration: append (nunca
// replace) evita corromper prompts customizados de conteúdo desconhecido,
// já que o LLM lê o system_prompt como um bloco contínuo de instruções —
// a ordem não muda o efeito.
//
// Uso:
//   npx tsx scripts/patch-custom-system-prompts.mts            (dry-run — só loga)
//   npx tsx scripts/patch-custom-system-prompts.mts --apply    (grava de fato)
// ============================================================

import { createAdminClient } from "../lib/supabase/admin"

const GATE_SECTION = `

SALES CALL GATE — CRITICAL FIRST CHECK:
Before scoring anything, first determine whether this transcript is actually a sales call — a conversation where one party is presenting/selling a product or service to a prospect, with some attempt at discovery, presenting an offer, handling objections, or closing.
It is NOT a sales call when the transcript is, for example: an internal team meeting, a customer-support/troubleshooting call, a personal conversation, silence/dead air, test audio, a wrong-number call, or any recording where no selling activity is taking place.
When in doubt, prefer true (mark it as a sales call) UNLESS the transcript gives a clear signal otherwise — a false positive on this gate costs far less than incorrectly discarding a real sales call. Examples:
- English: an internal standup ("okay team, let's review this week's numbers"), a support call ("I'm having trouble logging into my account") → isSalesCall: false. A discovery call with a prospect, a pitch, objection handling, or a close attempt → isSalesCall: true.
- Portuguese: uma reunião de equipe interna ("bom dia pessoal, vamos revisar as métricas da semana"), um chamado de suporte técnico ("meu login não está funcionando") → isSalesCall: false. Uma call de descoberta com prospect, apresentação de oferta, tratamento de objeção ou tentativa de fechamento → isSalesCall: true.`

const GATE_MARKER = "SALES CALL GATE — CRITICAL FIRST CHECK"

async function main() {
  const apply = process.argv.includes("--apply")
  const supabase = createAdminClient()

  const { data: rubrics, error } = await supabase
    .from("rubrics")
    .select("id, org_id, name, system_prompt")
    .not("system_prompt", "is", null)

  if (error) {
    console.error("Falha ao buscar rubrics:", error.message)
    process.exit(1)
  }

  if (!rubrics || rubrics.length === 0) {
    console.log("Nenhuma rubric com system_prompt customizado encontrada.")
    return
  }

  console.log(`Encontradas ${rubrics.length} rubric(s) com system_prompt customizado.`)
  console.log(apply ? "Modo: APLICANDO mudanças.\n" : "Modo: DRY-RUN (nada será gravado — use --apply para gravar).\n")

  for (const rubric of rubrics) {
    const prompt = rubric.system_prompt as string
    const alreadyPatched = prompt.includes(GATE_MARKER)

    console.log(`— [${rubric.id}] org=${rubric.org_id ?? "(global)"} name="${rubric.name}" len=${prompt.length}`)

    if (alreadyPatched) {
      console.log("  já contém a seção do gate — pulando.")
      continue
    }

    const patched = prompt + GATE_SECTION

    if (!apply) {
      console.log(`  [dry-run] adicionaria ${GATE_SECTION.length} caracteres ao final.`)
      continue
    }

    const { error: updateError } = await supabase
      .from("rubrics")
      .update({ system_prompt: patched })
      .eq("id", rubric.id)

    if (updateError) {
      console.error(`  ERRO ao atualizar: ${updateError.message}`)
    } else {
      console.log("  atualizado com sucesso.")
    }
  }
}

main()
