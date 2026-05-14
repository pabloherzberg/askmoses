/** @deprecated Use /api/rubric?config=true (GET) and /api/rubric (PATCH) instead */
import { type NextRequest } from 'next/server'
import { ok, unauthorized } from '@/lib/auth'
import { getSession, requireOwnerWrite } from '@/lib/auth'
import { getRubricConfig, updateRubricConfig } from '@/lib/services/rubric'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const data = await getRubricConfig()
  return ok(data)
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  try {
    const body = await request.json() as Record<string, unknown>
    const input = {
      systemPrompt: body.systemPrompt as string | undefined ?? body.system_prompt as string | undefined,
      llmModel: body.llmModel as string | undefined ?? body.llm_model as string | undefined,
    }
    const updated = await updateRubricConfig(input)
    return ok(updated)
  } catch (err) {
    console.error(err)
    return Response.json(
      { data: null, error: { message: 'Erro ao atualizar rubric', code: 500 } },
      { status: 500 },
    )
  }
}
