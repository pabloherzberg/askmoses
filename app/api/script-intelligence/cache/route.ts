import { type NextRequest } from 'next/server'
import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScriptIntelligenceResult } from '@/lib/mocks/data/script-intelligence'

interface CacheRow {
  id: string
  org_id: string
  org_script_id: string
  result: ScriptIntelligenceResult
  decisions: Decision[]
  created_at: string
  updated_at: string
}

export interface Decision {
  index: number
  decision: 'pending' | 'accepted' | 'rejected'
  editedText: string
}

// GET /api/script-intelligence/cache?orgScriptId=X
// Retorna o cache de resultado + decisões para o pending especificado.
export async function GET(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ cache: null })

  const orgScriptId = request.nextUrl.searchParams.get('orgScriptId')
  if (!orgScriptId) return ok({ cache: null })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('script_intelligence_cache')
    .select('*')
    .eq('org_id', ctx.activeOrgId)
    .eq('org_script_id', orgScriptId)
    .maybeSingle()

  if (error) {
    // Tabela pode não existir ainda — retorna null silenciosamente
    console.warn('[sic-cache] GET failed:', error.message)
    return ok({ cache: null })
  }

  return ok({ cache: data as CacheRow | null })
}

// POST /api/script-intelligence/cache
// Salva o resultado da IA no cache para o pending especificado.
// Body: { orgScriptId, result }
export async function POST(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ saved: false })

  const body = await request.json() as { orgScriptId: string; result: ScriptIntelligenceResult }
  const { orgScriptId, result } = body

  if (!orgScriptId || !result) return ok({ saved: false })

  const admin = createAdminClient()

  const { error } = await admin
    .from('script_intelligence_cache')
    .upsert({
      org_id: ctx.activeOrgId,
      org_script_id: orgScriptId,
      result,
      decisions: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,org_script_id' })

  if (error) {
    console.warn('[sic-cache] POST failed:', error.message)
    return ok({ saved: false })
  }

  return ok({ saved: true })
}

// PATCH /api/script-intelligence/cache
// Atualiza apenas as decisões do owner (aceitar/rejeitar/reescrever).
// Body: { orgScriptId, decisions }
export async function PATCH(request: NextRequest) {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ saved: false })

  const body = await request.json() as { orgScriptId: string; decisions: Decision[] }
  const { orgScriptId, decisions } = body

  if (!orgScriptId) return ok({ saved: false })

  const admin = createAdminClient()

  const { error } = await admin
    .from('script_intelligence_cache')
    .update({
      decisions,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', ctx.activeOrgId)
    .eq('org_script_id', orgScriptId)

  if (error) {
    console.warn('[sic-cache] PATCH failed:', error.message)
    return ok({ saved: false })
  }

  return ok({ saved: true })
}
