import { ok, unauthorized, forbidden, getSession, getRole } from '@/lib/auth'
import { getAllModuleConfigs, updateModuleConfig } from '@/lib/db/ai-module-configs'

// GET /api/ai-module-configs
//   Config atual de tuning por módulo + log de alterações. Admin only.
//   Lê de ai_module_configs (migration 101) via createAdminClient (service-role).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  try {
    const { configs, log } = await getAllModuleConfigs()
    return ok({ configs, log })
  } catch (err) {
    console.error('[ai-module-configs] GET failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }
}

// PUT /api/ai-module-configs
//   Body: { module_id, temperature, max_tokens }. Valida range server-side,
//   persiste em ai_module_configs e registra as alterações em
//   ai_module_config_log. Invalida o cache de tuning do pipeline. Admin only.
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  let body: { module_id?: string; temperature?: number; max_tokens?: number }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json(
      { data: null, error: { message: 'Body inválido', code: 400 } },
      { status: 400 },
    )
  }

  if (
    typeof body.module_id !== 'string' ||
    typeof body.temperature !== 'number' ||
    typeof body.max_tokens !== 'number'
  ) {
    return Response.json(
      { data: null, error: { message: 'module_id, temperature e max_tokens são obrigatórios', code: 400 } },
      { status: 400 },
    )
  }

  try {
    const result = await updateModuleConfig({
      module_id: body.module_id,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      updated_by: session.user.email ?? 'admin',
    })
    if ('error' in result) {
      return Response.json(
        { data: null, error: { message: result.error, code: result.code } },
        { status: result.code },
      )
    }
    return ok({ config: result.config, log: result.log })
  } catch (err) {
    console.error('[ai-module-configs] PUT failed', err)
    return Response.json(
      { data: null, error: { message: 'Erro interno', code: 500 } },
      { status: 500 },
    )
  }
}
