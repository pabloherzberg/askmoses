import { getActiveOrgContext, ok, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/scripts/active
//
//   Retorna o script ativo da org da sessão com suas sections completas.
//   Usado pela tela de insights para exibir o script atual do owner e
//   para comparar com sugestões pendentes do admin.
export async function GET() {
  const ctx = await getActiveOrgContext()
  if (!ctx) return unauthorized()
  if (!ctx.activeOrgId) return ok({ script: null })

  const admin = createAdminClient()

  const { data: script, error } = await admin
    .from('scripts')
    .select('id, name, description, sections, full_script, criteria, is_active, created_at, updated_at')
    .eq('org_id', ctx.activeOrgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[scripts/active] fetch failed:', error)
    return Response.json(
      { data: null, error: { message: 'Erro ao buscar script ativo', code: 500 } },
      { status: 500 },
    )
  }

  return ok({ script: script ?? null })
}
