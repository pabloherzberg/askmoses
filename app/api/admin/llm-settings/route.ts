import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { getAdminLlmSettings } from '@/lib/db/llm-settings'

// GET /api/admin/llm-settings
//   Retorna as linhas de provider (openai/gemini/…) com api_key mascarada, e
//   as linhas ativas de llm_pricing (COGS). Admin only. A lógica de leitura +
//   máscara vive em lib/db/llm-settings.ts (compartilhada com a página SSR).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  try {
    const { providers, pricing } = await getAdminLlmSettings()
    return ok({ providers, pricing })
  } catch (err) {
    console.error('[admin/llm-settings] GET failed', err)
    return Response.json({ data: null, error: { message: 'Erro interno', code: 500 } }, { status: 500 })
  }
}
