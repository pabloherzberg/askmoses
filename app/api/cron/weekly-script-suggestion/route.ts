import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateWeeklySuggestedScript } from '@/lib/script-intelligence/weekly-suggestion'
import { sendScriptToOrgs } from '@/lib/services/send-script'

// GET /api/cron/weekly-script-suggestion
//
//   Roda 1x por semana (vercel.json: "0 8 * * 1", segunda 08:00 UTC).
//   Gera um script novo a partir das 5 melhores calls fechadas (closed,
//   maior overall_score) de toda a base — não de uma org específica — e
//   envia esse MESMO script como sugestão (pending) a TODAS as
//   organizações, replicando o fluxo manual do admin no SaaS Panel
//   (POST /api/admin/scripts/send), só que sem intervenção humana.
//
//   A análise de Script Intelligence é disparada pelo mesmo mecanismo do
//   envio manual (sendScriptToOrgs → fire-and-forget pra
//   /api/script-intelligence/process), que se auto-encadeia entre as orgs
//   porque todas compartilham o mesmo script_id.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron,
//   mesmo de /api/cron/recover-stale-analyses).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  const generation = await generateWeeklySuggestedScript()
  if (!generation.ok) {
    console.error('[cron/weekly-script-suggestion] generation failed:', generation.error)
    return Response.json({ error: generation.error }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: orgs, error: orgsErr } = await admin.from('organizations').select('id')
  if (orgsErr) {
    console.error('[cron/weekly-script-suggestion] failed to list organizations:', orgsErr)
    return Response.json(
      { error: 'failed to list organizations', scriptId: generation.scriptId },
      { status: 500 },
    )
  }

  const orgIds = (orgs ?? []).map((o: { id: string }) => o.id)
  if (orgIds.length === 0) {
    return Response.json({ scriptId: generation.scriptId, callIdsUsed: generation.callIds, orgsSent: 0 })
  }

  try {
    const result = await sendScriptToOrgs({
      scriptId: generation.scriptId,
      orgIds,
      sentBy: null,
    })

    return Response.json({
      scriptId: generation.scriptId,
      callIdsUsed: generation.callIds,
      orgsSent: result.sentTo,
    })
  } catch (err) {
    console.error('[cron/weekly-script-suggestion] send failed:', err)
    return Response.json(
      { error: 'failed to send script to organizations', scriptId: generation.scriptId },
      { status: 500 },
    )
  }
}
