import { Resend } from "resend"
import { dbGetCallById, dbUpdateGhlCallPipeline } from "@/lib/db/calls"
import { dbGetTrainerById, dbGetTrainerDeliverability } from "@/lib/db/trainers"
import { buildCoachingEmail } from "@/lib/email/coaching-template"

interface DbSectionRow {
  name?: string
  score?: number
  critical?: boolean
  feedback?: string
  weight?: number | null
}

/**
 * Envia coaching email pro trainer da call GHL com os resultados do scoring.
 *
 * Best-effort:
 *   - Idempotente via calls.email_sent (não envia 2x).
 *   - No-op silencioso se RESEND_API_KEY não está setado (demo sem email).
 *   - DEV_EMAIL_OVERRIDE redireciona o destinatário (útil em preview).
 *   - Falha do Resend é logada mas não re-thrown — pipeline continua e
 *     email_sent fica false, permitindo retentativa manual depois.
 *
 * Pre-requisito: a call já passou pelo runGhlCallScoring (overall_score
 * preenchido, sections em formato 0-100). Se faltar score, skip.
 */
export async function sendGhlCoachingEmail(callId: string): Promise<void> {
  const call = await dbGetCallById(callId)
  if (!call) {
    console.warn("[ghl-coaching-email] call not found", { callId })
    return
  }
  if (call.email_sent) {
    return
  }

  // Dois motivos pra NÃO existir destinatário. Vale pro GHL e pro upload manual
  // (este arquivo é chamado do chunk-pipeline, compartilhado pelos dois).
  //
  //   1. FRONT DESK — o email em `users` é sintético (@system.askmoses.ai) e o
  //      calls.trainer_email podia ser o endereço REAL de alguém que não está na
  //      plataforma. Por isso o gate é por is_system, e NÃO por "trainer_email
  //      vazio": é justamente quando o campo está preenchido que existe risco de
  //      mandar coaching não solicitado pra um terceiro.
  //
  //   2. CONVITE PENDENTE — a pessoa ainda não entrou no sistema. Receber a
  //      análise da própria call por email antes de ter login é estranho: ela
  //      recebe quando aceitar. Como email_sent fica false, dá pra disparar
  //      retroativamente depois sem perder nada.
  //
  // Call sem trainer_id (legado / upload antigo) não passa por aqui — segue o
  // caminho antigo, decidido só por trainer_email.
  if (call.trainer_id) {
    const deliverability = await dbGetTrainerDeliverability(call.trainer_id)
    if (deliverability?.isSystem) {
      console.info("[ghl-coaching-email] skip — call do Front Desk (rep de sistema)", {
        callId,
        trainerId: call.trainer_id,
      })
      return
    }
    if (deliverability && !deliverability.inviteAccepted) {
      console.info("[ghl-coaching-email] skip — trainer ainda não aceitou o convite", {
        callId,
        trainerId: call.trainer_id,
      })
      return
    }
  }

  // Fallback: trainer_email pode vir vazio do GHL (ex.: merge tag que não
  // resolveu para o usuário — comum quando um owner-vendedor não está
  // configurado como Phone System User individual no GHL). Com trainer_id
  // vinculado, users.email é a fonte confiável — evita perder o envio por um
  // campo vazio vindo do payload externo.
  let trainerEmail = call.trainer_email
  let trainerName = call.trainer_name
  if (!trainerEmail && call.trainer_id) {
    const trainer = await dbGetTrainerById(call.trainer_id)
    if (trainer?.email) {
      trainerEmail = trainer.email
      trainerName = trainer.name
    }
  }

  if (!trainerEmail) {
    console.warn("[ghl-coaching-email] skip — no trainer_email on call (and no fallback via users.email)", { callId })
    return
  }
  if (call.overall_score == null) {
    console.info("[ghl-coaching-email] skip — no overall_score (scoring did not run)", { callId })
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[ghl-coaching-email] skip — RESEND_API_KEY not set", { callId })
    return
  }

  // sections vem do DB como jsonb com score 0-100. Template espera 0-100 também
  // (faz a conversão para display internamente via toDisplay5).
  const rawSections = Array.isArray(call.sections)
    ? (call.sections as DbSectionRow[])
    : []
  const sections = rawSections.map((s) => ({
    name: s.name ?? "",
    score: typeof s.score === "number" ? s.score : 0,
    critical: Boolean(s.critical),
    feedback: s.feedback ?? "",
  }))

  const { subject, html } = buildCoachingEmail({
    trainerName: trainerName ?? "Trainer",
    trainerEmail,
    clientName: call.client_name ?? undefined,
    overallScore: call.overall_score,
    sections,
    strengths: call.strengths ?? [],
    improvements: call.improvements ?? [],
    // O scoring gera sections.feedback/strengths/improvements SEMPRE em inglês
    // (ver lib/services/scoring.ts — "Section feedback and summary should be in
    // English for the coach UI"). Forçar o template em 'pt' deixava o chrome em
    // português com o conteúdo em inglês. 'en' alinha os dois.
    locale: "en",
  })

  const resend = new Resend(apiKey)
  const to = process.env.DEV_EMAIL_OVERRIDE ?? trainerEmail

  const { data, error } = await resend.emails.send({
    from: "AskMoses.AI <noreply@askmoses.ai>",
    to,
    subject,
    html,
  })

  if (error) {
    console.error("[ghl-coaching-email] Resend error", {
      callId,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  try {
    await dbUpdateGhlCallPipeline(callId, {
      emailSent: true,
      emailId: data?.id ?? null,
    })
  } catch (err) {
    console.error("[ghl-coaching-email] failed to mark email_sent", {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
  }

  console.info("[ghl-coaching-email] sent", {
    callId,
    emailId: data?.id,
    to,
    overrideActive: Boolean(process.env.DEV_EMAIL_OVERRIDE),
  })
}
