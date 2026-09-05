import { type NextRequest } from 'next/server'
import { forbidden, getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildFullScriptFromSections, type ScriptSection } from '@/lib/db/scripts'

// POST /api/scripts/resolve-sections
//
//   Body: {
//     orgScriptId: string
//     decisions: Array<{ sectionName: string; decision: 'accepted' | 'rejected'; editedText?: string }>
//   }
//
//   Resolve o pending seção a seção (fluxo do Script Intelligence). A
//   sugestão de cada seção é o texto do script novo enviado pelo admin
//   (analyze.ts: suggestedQuote = sugSec.instructions), então:
//
//     accepted → seção fica com o texto do script novo (ou o editedText que
//                o owner reescreveu à mão)
//     rejected → seção mantém o texto do script atual da org
//     sem decisão (seção não mudou entre os scripts) → texto do script novo
//
//   O script enviado pelo admin é global (org_id NULL) e compartilhado entre
//   orgs — NUNCA editá-lo no lugar. O merge vira um CLONE org-scoped
//   (org_id = org da sessão, owner_edit_version + 1) e o pending é promovido
//   a active apontando pro clone.
//
//   Se todas as decisões forem 'rejected', o caller deve usar /api/scripts/reject
//   (mantém o script atual, sem clone). Aqui exigimos ao menos um accepted.
//
//   Owner da própria org ou admin impersonando. Trainer é barrado.

interface DecisionInput {
  sectionName?: unknown
  decision?: unknown
  editedText?: unknown
}

interface ResolveBody {
  orgScriptId?: string
  decisions?: DecisionInput[]
}

interface ScriptRow {
  id: string
  org_id: string | null
  rubric_id: string | null
  name: string
  description: string | null
  sections: ScriptSection[] | null
  criteria: unknown
  rubric_version_snapshot: number | null
  minor_version: number | null
  owner_edit_version: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string, reason: string) {
  return Response.json({ data: null, error: { message, code: 400, reason } }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (ctx.role !== 'owner' && !(ctx.role === 'admin' && ctx.isImpersonating)) return forbidden()
  if (!ctx.activeOrgId) return forbidden()

  let body: ResolveBody
  try {
    body = (await request.json()) as ResolveBody
  } catch {
    return badRequest('Body inválido', 'INVALID_BODY')
  }

  const { orgScriptId } = body
  if (!orgScriptId || !UUID_RE.test(orgScriptId)) {
    return badRequest('orgScriptId inválido', 'INVALID_ORG_SCRIPT_ID')
  }

  if (!Array.isArray(body.decisions) || body.decisions.length === 0) {
    return badRequest('decisions inválido', 'INVALID_DECISIONS')
  }

  // Normaliza e valida as decisões. Chave = nome da seção em lowercase —
  // mesmo critério de match que a UI usa entre análise e script.
  const decisionByName = new Map<string, { decision: 'accepted' | 'rejected'; editedText: string | null }>()
  for (const d of body.decisions) {
    if (typeof d?.sectionName !== 'string' || !d.sectionName.trim()) {
      return badRequest('sectionName inválido', 'INVALID_DECISIONS')
    }
    if (d.decision !== 'accepted' && d.decision !== 'rejected') {
      return badRequest('decision deve ser accepted ou rejected', 'INVALID_DECISIONS')
    }
    const editedText = typeof d.editedText === 'string' && d.editedText.trim() ? d.editedText : null
    decisionByName.set(d.sectionName.trim().toLowerCase(), { decision: d.decision, editedText })
  }

  const hasAccepted = [...decisionByName.values()].some((d) => d.decision === 'accepted')
  if (!hasAccepted) {
    return badRequest('Nenhuma seção aceita — use /api/scripts/reject', 'NO_ACCEPTED_SECTION')
  }

  const admin = createAdminClient()

  // 1) Pending da org da sessão. WHERE org_id impede resolver pending de
  //    outra tenant via id direto.
  const { data: pending, error: pendingErr } = await admin
    .from('org_scripts')
    .select('id, org_id, script_id, previous_script_id')
    .eq('id', orgScriptId)
    .eq('org_id', ctx.activeOrgId)
    .eq('status', 'pending')
    .is('ended_at', null)
    .maybeSingle()

  if (pendingErr) {
    console.error('[scripts/resolve-sections] fetch pending failed:', pendingErr)
    return Response.json(
      { data: null, error: { message: 'Erro ao buscar pending', code: 500, reason: 'FETCH_FAILED' } },
      { status: 500 },
    )
  }
  if (!pending) {
    return Response.json(
      { data: null, error: { message: 'Pending não encontrado ou já resolvido', code: 404, reason: 'PENDING_NOT_FOUND' } },
      { status: 404 },
    )
  }

  // 2) Script novo (incoming) + script atual (previous) pra montar o merge.
  const scriptCols = 'id, org_id, rubric_id, name, description, sections, criteria, rubric_version_snapshot, minor_version, owner_edit_version'
  const { data: incoming, error: incomingErr } = await admin
    .from('scripts')
    .select(scriptCols)
    .eq('id', pending.script_id)
    .maybeSingle()

  if (incomingErr || !incoming) {
    console.error('[scripts/resolve-sections] missing incoming script:', incomingErr)
    return Response.json(
      { data: null, error: { message: 'Script sugerido não encontrado', code: 500, reason: 'SCRIPT_NOT_FOUND' } },
      { status: 500 },
    )
  }

  let current: ScriptRow | null = null
  if (pending.previous_script_id) {
    const { data: prev } = await admin
      .from('scripts')
      .select(scriptCols)
      .eq('id', pending.previous_script_id)
      .maybeSingle()
    current = (prev as ScriptRow | null) ?? null
  }

  const incomingRow = incoming as ScriptRow
  const incomingSections = Array.isArray(incomingRow.sections) ? incomingRow.sections : []
  const currentSections = Array.isArray(current?.sections) ? current!.sections : []

  // 3) Merge por nome de seção. Base = script novo; rejeitadas restauram o
  //    texto atual; aceitas com edição usam o texto do owner.
  const mergedSections: ScriptSection[] = incomingSections.map((sec) => {
    const key = sec.name.trim().toLowerCase()
    const decision = decisionByName.get(key)
    if (!decision) return sec

    if (decision.decision === 'accepted') {
      return decision.editedText ? { ...sec, instructions: decision.editedText } : sec
    }

    const currentSec = currentSections.find((c) => c.name.trim().toLowerCase() === key)
    if (!currentSec) return sec
    return { ...sec, instructions: currentSec.instructions, tips: currentSec.tips }
  })

  // 4) Clone org-scoped com o merge. Nunca gravar no script global.
  const { data: clone, error: cloneErr } = await admin
    .from('scripts')
    .insert({
      org_id: ctx.activeOrgId,
      rubric_id: incomingRow.rubric_id,
      name: incomingRow.name,
      description: incomingRow.description,
      sections: mergedSections,
      full_script: buildFullScriptFromSections(mergedSections),
      criteria: incomingRow.criteria ?? [],
      is_active: true,
      rubric_version_snapshot: incomingRow.rubric_version_snapshot ?? 1,
      minor_version: incomingRow.minor_version ?? 0,
      owner_edit_version: (incomingRow.owner_edit_version ?? 0) + 1,
    })
    .select('id')
    .single()

  if (cloneErr || !clone) {
    console.error('[scripts/resolve-sections] clone insert failed:', cloneErr)
    return Response.json(
      { data: null, error: { message: 'Erro ao criar versão da org', code: 500, reason: 'CLONE_FAILED' } },
      { status: 500 },
    )
  }

  // 5) Reaponta o pending pro clone ANTES de promover. Se o passo 6 falhar,
  //    o registro continua pending (retry seguro) em vez de ativar o global.
  const { error: repointErr } = await admin
    .from('org_scripts')
    .update({ script_id: clone.id })
    .eq('id', pending.id)
    .eq('org_id', ctx.activeOrgId)
    .eq('status', 'pending')
    .is('ended_at', null)

  if (repointErr) {
    console.error('[scripts/resolve-sections] repoint failed:', repointErr)
    await admin.from('scripts').delete().eq('id', clone.id)
    return Response.json(
      { data: null, error: { message: 'Erro ao vincular versão da org', code: 500, reason: 'REPOINT_FAILED' } },
      { status: 500 },
    )
  }

  // 6) Promove pending → active pela mesma RPC do "Approve all" (fecha as
  //    outras linhas abertas da org e reseta started_at).
  const { data, error: rpcErr } = await admin.rpc('accept_org_script', {
    p_org_script_id: pending.id,
    p_org_id: ctx.activeOrgId,
  })

  if (rpcErr) {
    console.error('[scripts/resolve-sections] accept rpc failed:', rpcErr)
    return Response.json(
      { data: null, error: { message: 'Erro ao ativar script', code: 500, reason: 'RPC_FAILED' } },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as Array<{ out_id: string; out_status: string; out_script_id: string }>
  if (rows.length === 0) {
    return Response.json(
      { data: null, error: { message: 'Pending não encontrado ou já resolvido', code: 404, reason: 'PENDING_NOT_FOUND' } },
      { status: 404 },
    )
  }

  return ok({
    orgScriptId: rows[0].out_id,
    scriptId: rows[0].out_script_id,
    status: rows[0].out_status,
    sectionsAccepted: [...decisionByName.values()].filter((d) => d.decision === 'accepted').length,
    sectionsRejected: [...decisionByName.values()].filter((d) => d.decision === 'rejected').length,
  })
}
