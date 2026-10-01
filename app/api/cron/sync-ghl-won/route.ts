import { type NextRequest } from 'next/server'
import { dbListGhlEnabledOrgs } from '@/lib/db/organizations'

// GET /api/cron/sync-ghl-won — dispatcher do sync diário de Won por lead.
//
//   Substitui /api/cron/sync-ghl-opportunities, que baixava todas as
//   opportunities won/lost da location numa execução só e estourava os 300s
//   (504 em 30/09 e 01/10/2026; 7 orgs sem Won novo desde 25/09).
//
//   Aqui cada org roda na SUA invocação (/api/cron/sync-ghl-won/[orgId]), com
//   maxDuration próprio e orçamento de tempo: uma org grande não come o tempo
//   das outras. O dispatcher só dispara e espera os resultados para o log.
//
//   O webhook de opportunity continua sendo o caminho em tempo real.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  let orgs
  try {
    orgs = await dbListGhlEnabledOrgs()
  } catch (err) {
    console.error('[cron/sync-ghl-won] failed to list orgs:', err)
    return Response.json({ error: 'failed to list orgs' }, { status: 500 })
  }

  const origin = request.nextUrl.origin
  const results = await Promise.allSettled(
    orgs.map(async (org) => {
      const res = await fetch(`${origin}/api/cron/sync-ghl-won/${encodeURIComponent(org.orgId)}`, {
        headers: { authorization: expected },
      })
      const body = await res.json().catch(() => null)
      return { orgId: org.orgId, status: res.status, body }
    }),
  )

  const summary = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { orgId: orgs[i].orgId, status: 0, body: String(r.reason) },
  )
  const failed = summary.filter((s) => s.status !== 200)
  if (failed.length > 0) console.error('[cron/sync-ghl-won] orgs com falha', failed)

  return Response.json({ orgsDispatched: orgs.length, failed: failed.length, results: summary })
}
