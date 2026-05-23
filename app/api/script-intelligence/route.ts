import { type NextRequest } from 'next/server'
import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { runScriptIntelligence } from '@/lib/script-intelligence/analyze'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScriptSection } from '@/lib/db/scripts'

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

  // Load active script of the org as fallback
  async function loadActiveScript(): Promise<{ id: string; name: string; description: string | null; sections: ScriptSection[] } | null> {
    const { data } = await admin
      .from('scripts')
      .select('id, name, description, sections')
      .eq('org_id', ctx!.activeOrgId!)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
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

  return ok(analysis.result)
}
