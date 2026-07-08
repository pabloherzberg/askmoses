import { type NextRequest } from 'next/server'
import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { runScriptIntelligence } from '@/lib/script-intelligence/analyze'
import { createAdminClient } from '@/lib/supabase/admin'
import { translateScriptIntelligence } from '@/lib/i18n/translate-coaching'
import { routing } from '@/i18n/routing'
import type { Locale } from '@/i18n/routing'
import type { ScriptSection } from '@/lib/db/scripts'

// A UI manda o idioma atual no x-locale. Traduzimos a resposta AI-generated pra
// exibição; o client só cacheia (POST /cache) quando locale==='en', mantendo o
// cache canônico em inglês (ver comentário no client).
function resolveLocale(raw: string | null): Locale {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw as Locale
  return 'en'
}

// POST /api/script-intelligence
// Body: { scriptId?: string, currentScriptId?: string }
//   scriptId = suggested script (pending incoming)
//   currentScriptId = active script of the org
// If only one ID is provided, treats it as the current script (no suggestion comparison).
export async function POST(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return Response.json(
    { data: null, error: { message: 'No active organization', code: 403 } },
    { status: 403 },
  )

  let scriptId: string | undefined
  let currentScriptId: string | undefined
  try {
    const body = await request.json() as { scriptId?: string; currentScriptId?: string }
    scriptId = body.scriptId
    currentScriptId = body.currentScriptId
  } catch {
    // body optional
  }

  const admin = createAdminClient()

  // Load active script of the org — source of truth is org_scripts.status='active',
  // fallback to scripts.is_active=true filtered by org_id for legacy orgs.
  async function loadActiveScript(): Promise<{ id: string; name: string; description: string | null; sections: ScriptSection[] } | null> {
    const { data: orgScriptRow } = await admin
      .from('org_scripts')
      .select('script_id')
      .eq('org_id', ctx!.activeOrgId!)
      .eq('status', 'active')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const scriptId = orgScriptRow?.script_id as string | null | undefined

    const query = scriptId
      ? admin
          .from('scripts')
          .select('id, name, description, sections')
          .eq('id', scriptId)
          .maybeSingle()
      : admin
          .from('scripts')
          .select('id, name, description, sections')
          .eq('org_id', ctx!.activeOrgId!)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

    const { data } = await query
    return data as { id: string; name: string; description: string | null; sections: ScriptSection[] } | null
  }

  // Resolve current script ID. Quando o caller (frontend) não fornece um
  // currentScriptId E a org não tem script ativo no schema antigo, isso é o
  // caso de "primeira aprovação" — sem base de comparação. Devolve um shape
  // diferenciado pra UI mostrar empty state em vez de tratar como erro.
  let resolvedCurrentScriptId = currentScriptId
  if (!resolvedCurrentScriptId) {
    const activeScript = await loadActiveScript()
    if (!activeScript) {
      return ok({ firstApproval: true })
    }
    resolvedCurrentScriptId = activeScript.id
  }

  // If no suggested script, use current as both (scores only, no suggestions)
  const resolvedSuggestedScriptId = scriptId ?? resolvedCurrentScriptId

  const analysis = await runScriptIntelligence(resolvedCurrentScriptId, resolvedSuggestedScriptId, ctx.activeOrgId)

  if (!analysis.ok) {
    const isNoCalls = analysis.error.includes('No calls')
    return Response.json(
      { data: null, error: { message: analysis.error, code: isNoCalls ? 422 : 500 } },
      { status: isNoCalls ? 422 : 500 },
    )
  }

  const locale = resolveLocale(request.headers.get('x-locale'))
  if (locale === 'en') return ok(analysis.result)
  try {
    return ok(await translateScriptIntelligence(analysis.result, locale))
  } catch (err) {
    console.error('[script-intelligence] translation failed (serving English):', err)
    return ok(analysis.result)
  }
}
