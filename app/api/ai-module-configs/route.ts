import { ok, unauthorized, forbidden } from '@/lib/auth'
import { getSession, getRole } from '@/lib/auth'
import { aiModuleConfigs, aiModuleConfigLog } from '@/lib/mock-data'
import type { AiModuleId } from '@/lib/types'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  return ok({ configs: aiModuleConfigs, log: aiModuleConfigLog })
}

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = await getRole()
  if (role !== 'admin') return forbidden()

  const body = await request.json() as { module_id: AiModuleId; temperature: number; max_tokens: number }
  const idx = aiModuleConfigs.findIndex((c) => c.module_id === body.module_id)
  if (idx === -1) {
    return Response.json({ data: null, error: { message: 'Module not found', code: 404 } }, { status: 404 })
  }

  const prev = aiModuleConfigs[idx]
  const now = new Date().toISOString()
  const updatedBy = session.user.email ?? 'admin'

  if (prev.temperature !== body.temperature) {
    aiModuleConfigLog.unshift({
      id: `log-${Date.now()}-t`,
      module_id: body.module_id,
      field: 'temperature',
      previous_value: prev.temperature,
      new_value: body.temperature,
      updated_by: updatedBy,
      updated_at: now,
    })
  }
  if (prev.max_tokens !== body.max_tokens) {
    aiModuleConfigLog.unshift({
      id: `log-${Date.now()}-m`,
      module_id: body.module_id,
      field: 'max_tokens',
      previous_value: prev.max_tokens,
      new_value: body.max_tokens,
      updated_by: updatedBy,
      updated_at: now,
    })
  }

  aiModuleConfigs[idx] = {
    ...prev,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    updated_by: updatedBy,
    updated_at: now,
  }

  return ok({ config: aiModuleConfigs[idx], log: aiModuleConfigLog })
}
