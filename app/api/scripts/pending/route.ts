import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/scripts/pending
//
//   Retorna o pending script ativo da org da sessão (no máximo um — partial
//   unique uniq_org_scripts_open_per_org garante isso) com metadados do
//   script novo e do anterior pro modal de aprovação do Owner.
//
//   Quando não há pending, retorna { pending: null } com 200 — front trata
//   ausência sem precisar de 404. Mantém o handler simples e cacheable
//   por client (Banner re-poll on focus).
//
//   Admin impersonando vê o pending da org alvo (read-only). Trainer pode
//   ver pra UI saber se algo está pendente, mas não consegue accept/reject
//   (esses endpoints checam role separadamente).
export async function GET() {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ pending: null })

  const admin = createAdminClient()

  // Leitura direta de org_scripts (não da view org_scripts_current) porque
  // precisamos do previous_script_id, que a view não expõe. Resolvemos os
  // metadados dos scripts em queries separadas pra não depender do nome
  // exato da FK no embed do PostgREST.
  const { data: pending, error } = await admin
    .from('org_scripts')
    .select('id, org_id, script_id, previous_script_id, started_at, sent_by')
    .eq('org_id', ctx.activeOrgId)
    .eq('status', 'pending')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[scripts/pending] fetch pending failed:', error)
    return Response.json(
      { data: null, error: { message: 'Erro ao buscar pending', code: 500 } },
      { status: 500 },
    )
  }

  if (!pending) return ok({ pending: null })

  // Lemos analysis_status pra UI saber se a análise IA terminou. Owner vê o
  // pending mesmo enquanto está 'processing' (com badge "Analisando…" e ações
  // desabilitadas) — esconder causava loader eterno em orgs sem script ativo.
  const { data: cacheRow } = await admin
    .from('script_intelligence_cache')
    .select('analysis_status')
    .eq('org_id', ctx.activeOrgId)
    .eq('org_script_id', pending.id)
    .maybeSingle()

  const analysisStatus =
    (cacheRow?.analysis_status as 'processing' | 'queued' | 'ready' | 'error' | null) ?? null

  const { data: scriptRow, error: scriptErr } = await admin
    .from('scripts')
    .select('id, name, description, rubric_version_snapshot, minor_version')
    .eq('id', pending.script_id)
    .maybeSingle()

  if (scriptErr || !scriptRow) {
    console.error('[scripts/pending] missing script row for pending:', scriptErr)
    return Response.json(
      { data: null, error: { message: 'Script associado não encontrado', code: 500 } },
      { status: 500 },
    )
  }

  // Carrega metadados do script anterior (se existir). Query separada
  // mantém a join principal limpa — previous_script_id pode ser null.
  let previous: {
    id: string
    name: string
    description: string | null
    version: string
  } | null = null

  if (pending.previous_script_id) {
    const { data: prev } = await admin
      .from('scripts')
      .select('id, name, description, rubric_version_snapshot, minor_version')
      .eq('id', pending.previous_script_id)
      .maybeSingle()
    if (prev) {
      previous = {
        id: prev.id,
        name: prev.name,
        description: prev.description,
        version: `${prev.rubric_version_snapshot}.${prev.minor_version}`,
      }
    }
  }

  // Nome de quem enviou — opcional, melhora o copy do modal ("Enviado por X").
  // auth.users não é acessível via PostgREST direto, então usamos a admin API.
  let sentByName: string | null = null
  if (pending.sent_by) {
    const { data: sender } = await admin.auth.admin.getUserById(pending.sent_by)
    if (sender?.user?.email) sentByName = sender.user.email
  }

  return ok({
    pending: {
      orgScriptId: pending.id,
      startedAt: pending.started_at,
      sentByName,
      analysisStatus,
      incoming: {
        id: scriptRow.id,
        name: scriptRow.name,
        description: scriptRow.description,
        version: `${scriptRow.rubric_version_snapshot}.${scriptRow.minor_version}`,
      },
      previous,
    },
  })
}
