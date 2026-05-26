import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { dbCreateRubric } from '@/lib/db/rubric'
import { dbCreateScript } from '@/lib/db/scripts'
import type { Role } from '@/lib/types'

function badRequest(message: string) {
  return Response.json(
    { data: null, error: { message, code: 400 } },
    { status: 400 },
  )
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  try {
    const body = await request.json() as {
      name?: string
      description?: string
      orgId?: string | null
      systemPrompt?: string | null
      llmModel?: string | null
    }

    if (!body.name || body.name.trim().length === 0) {
      return badRequest('Name is required')
    }

    // 1. Create the new rubric
    const newRubric = await dbCreateRubric({
      orgId: body.orgId ?? null,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      isDefault: false,
      systemPrompt: body.systemPrompt || "You are a professional call evaluator. Assess the following call carefully.",
      llmModel: body.llmModel || "openai/gpt-4o-mini",
    })

    // 2. Create the initial script (version 1.0) for this new rubric
    // The db schema defines rubric_version_snapshot = 1 and minor_version = 0 by default, 
    // which effectively acts as 1.0. 
    // Admin creates "template scripts" so is_template should be true in DB, 
    // but dbCreateScript doesn't expose is_template yet.
    // However, if orgId is null, it's globally treated as template by some logics.
    await dbCreateScript({
      orgId: undefined, // Global script
      rubricId: newRubric.id,
      name: "Script Inicial v1.0",
      description: "Script inicial criado automaticamente com a rubric.",
      sections: [],
      criteria: [],
      isActive: true,
    })

    return ok(newRubric)
  } catch (err) {
    console.error('[admin/rubrics] POST failed', err)
    return Response.json(
      { data: null, error: { message: 'Internal error', code: 500 } },
      { status: 500 },
    )
  }
}
