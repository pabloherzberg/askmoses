import { type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimitDb, rateLimitedResponse } from '@/lib/auth/rate-limit'
import { requireSameOrigin } from '@/lib/auth/csrf'
import { RATE_LIMITS } from '@/lib/constants/limits'
import type { Role } from '@/lib/types'

interface PatchBody {
  scriptId?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

function serverError(context: string, err?: unknown) {
  console.error(`[admin/organizations/script] ${context}`, err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 },
  )
}

// PATCH /api/admin/organizations/[id]/script
//   Body: { scriptId }
//
//   Force-set do active script da org via painel SaaS. Bypassa o fluxo de
//   pending/accept — Admin força a troca, Owner é notificado por email
//   ("brute-force change"). Usado quando o Owner está bloqueado e não
//   consegue trocar/aceitar pela UI dele.
//
//   Comportamento:
//     1. Fecha o active corrente da org (status='active' preservado, só seta ended_at).
//     2. Upsert (org_id, scriptId) → status='active', ended_at=NULL, started_at=now.
//     3. Email pro Owner via Resend (best-effort — falha não desfaz a troca).
//
//   Admin only. Usa o partial unique split da 057 (1 active + 1 pending).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOrigin(request)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  const { id: orgId } = await params
  if (!UUID_RE.test(orgId)) return badRequest('orgId inválido')

  // Rate limit: reusa o bucket de script_send pra evitar spam do mesmo Admin.
  const rl = await checkRateLimitDb(
    `script_send:${session.user.id}`,
    RATE_LIMITS.scriptSend.max,
    RATE_LIMITS.scriptSend.windowSeconds,
  )
  if (!rl.allowed) return rateLimitedResponse(rl)

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Body inválido')
  }

  const scriptId = body.scriptId?.trim()
  if (!scriptId || !UUID_RE.test(scriptId)) return badRequest('scriptId inválido')

  const admin = createAdminClient()

  // Valida org existe (defesa antes de FK violation).
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) return serverError('Falha ao validar org', orgErr)
  if (!org) return badRequest('org não encontrada')

  // Valida script existe (pode ser template org_id=NULL ou local da org).
  const { data: scriptRow, error: scriptErr } = await admin
    .from('scripts')
    .select('id, name')
    .eq('id', scriptId)
    .maybeSingle()
  if (scriptErr) return serverError('Falha ao validar script', scriptErr)
  if (!scriptRow) return badRequest('script não encontrado')

  // Active corrente — usado pra: (a) decidir se há mudança real e (b) pular
  // o PATCH se o script já é o active (no-op). Embed scripts!script_id pra
  // pegar o nome junto (disambiguação obrigatória — org_scripts tem 2 FKs
  // pra scripts: script_id e previous_script_id).
  const { data: currentRow } = await admin
    .from('org_scripts')
    .select('script_id, scripts!script_id(name)')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .is('ended_at', null)
    .maybeSingle()

  type CurrentEmbed = {
    script_id: string
    scripts: { name: string } | { name: string }[] | null
  } | null
  const current = currentRow as unknown as CurrentEmbed
  const currentScriptName = current
    ? Array.isArray(current.scripts)
      ? (current.scripts[0]?.name ?? null)
      : (current.scripts?.name ?? null)
    : null

  if (current?.script_id === scriptId) {
    return ok({ unchanged: true, scriptId, scriptName: scriptRow.name })
  }

  // ── 1a. Fecha active corrente (mantém status='active', só ended_at) ────
  const now = new Date().toISOString()
  const { error: closeErr } = await admin
    .from('org_scripts')
    .update({ ended_at: now })
    .eq('org_id', orgId)
    .eq('status', 'active')
    .is('ended_at', null)
  if (closeErr) return serverError('Falha ao fechar active anterior', closeErr)

  // ── 1b. Fecha pending corrente, se existir e for de OUTRO script. ──────
  // Sem isso, o owner pode aceitar o pending depois e desfazer o override
  // do admin (accept_org_script fecha o active e promove o pending). Quando
  // o pending é PRECISAMENTE o script alvo do override, deixa passar — o
  // upsert abaixo vai converter ele em active sem perder história.
  const { error: closePendingErr } = await admin
    .from('org_scripts')
    .update({ status: 'rejected', ended_at: now })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .is('ended_at', null)
    .neq('script_id', scriptId)
  if (closePendingErr) {
    console.warn('[admin/organizations/script] falha ao fechar pending:', closePendingErr)
  }

  // ── 2. Upsert do novo active. Se (org, scriptId) já existe (era pending
  //      ou active histórico), reativa; senão INSERT puro. ────────────────
  const { error: upsertErr } = await admin
    .from('org_scripts')
    .upsert(
      {
        org_id: orgId,
        script_id: scriptId,
        status: 'active',
        started_at: now,
        ended_at: null,
        sent_by: session.user.id,
      },
      { onConflict: 'org_id,script_id' },
    )
  if (upsertErr) return serverError('Falha ao ativar novo script', upsertErr)

  // ── 3. Notifica TODOS os owners da org por email (best-effort) ──────────
  // Org pode ter múltiplos owners (Sprint 04 dá suporte a co-owners). Cada um
  // recebe o aviso individualmente. Falha de email num owner não derruba os
  // demais nem desfaz a troca.
  const emailDelivery: { sent: number; failed: number; mocked: number; skipped: number } = {
    sent: 0,
    failed: 0,
    mocked: 0,
    skipped: 0,
  }

  try {
    // memberships tem 2 FKs pra users (user_id e invited_by) — sem o hint
    // `!user_id` o PostgREST estoura "more than one relationship was found".
    // Não usamos `!inner` porque após o user_id fix a join já é determinística
    // — basta filtrar null no JS.
    const { data: memberships, error: membershipsErr } = await admin
      .from('memberships')
      .select('users!user_id(email, name)')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('invite_status', 'accepted')

    if (membershipsErr) {
      console.error('[admin/organizations/script] falha ao buscar owners:', membershipsErr)
    }

    type OwnerRow = { users: { email: string | null; name: string | null } | null }
    const owners = ((memberships ?? []) as unknown as OwnerRow[])
      .map((m) => m.users)
      .filter((u): u is { email: string; name: string | null } => !!u?.email)

    if (owners.length === 0) {
      console.warn(`[admin/organizations/script] Nenhum owner accepted pra org=${orgId} — notificações puladas.`)
      emailDelivery.skipped = 1
    } else {
      const apiKey = process.env.RESEND_API_KEY
      const devOverride = process.env.DEV_EMAIL_OVERRIDE
      const subject = `Script da ${org.name} alterado pelo Admin`
      const previousLine = current?.script_id
        ? `<p>Script anterior: <strong>${currentScriptName ?? '—'}</strong> (<code>${current.script_id}</code>)</p>`
        : '<p>Sua org não tinha um script ativo configurado anteriormente.</p>'

      if (!apiKey) {
        console.warn('[admin/organizations/script] RESEND_API_KEY ausente — emails mockados.')
        emailDelivery.mocked = owners.length
      } else {
        const resend = new Resend(apiKey)
        // Em paralelo: 1 send por owner. allSettled pra coletar
        // sucesso/falha de cada um sem fail-fast.
        const results = await Promise.allSettled(
          owners.map((owner) => {
            const html = `
              <p>Olá ${owner.name ?? 'Owner'},</p>
              <p>O Admin alterou o script ativo da sua organização (<strong>${org.name}</strong>) para <strong>${scriptRow.name}</strong> (<code>${scriptRow.id}</code>).</p>
              ${previousLine}
              <p>Essa alteração foi aplicada sem revisão prévia. Se você não esperava essa mudança, entre em contato com o suporte.</p>
            `
            const to = devOverride ?? owner.email
            return resend.emails.send({
              from: 'AskMoses.AI <noreply@askmoses.ai>',
              to,
              subject,
              html,
            })
          }),
        )

        for (const r of results) {
          if (r.status === 'fulfilled' && !r.value.error) {
            emailDelivery.sent += 1
          } else {
            emailDelivery.failed += 1
            const err = r.status === 'rejected' ? r.reason : r.value.error
            console.error('[admin/organizations/script] Resend falhou pra um owner:', err)
          }
        }
      }
    }
  } catch (e) {
    console.error('[admin/organizations/script] notificação owners falhou:', e)
    emailDelivery.failed += 1
  }

  return ok({
    scriptId,
    scriptName: scriptRow.name,
    previousScriptId: current?.script_id ?? null,
    emailDelivery,
  })
}
