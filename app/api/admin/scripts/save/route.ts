import { type NextRequest } from 'next/server'
import { getSession, ok, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbCreateScript } from '@/lib/db/scripts'
import type { Role } from '@/lib/types'
import type { ScriptSection, ScriptCriterion } from '@/lib/db/scripts'

interface SaveBody {
  sourceScriptId: string
  name: string
  description?: string | null
  sections: ScriptSection[]
  criteria: ScriptCriterion[]
  full_script?: string | null
}

// POST /api/admin/scripts/save
// Persists an AI-improved script as a new row with minor_version bumped.
// Returns { id, name, minor_version } of the new script.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const role = session.user.app_metadata?.role as Role | undefined
  if (role !== 'admin') return forbidden()

  let body: SaveBody
  try {
    body = (await request.json()) as SaveBody
  } catch {
    return Response.json(
      { data: null, error: { message: 'Invalid body', code: 400 } },
      { status: 400 },
    )
  }

  const { sourceScriptId, name, description, sections, criteria, full_script } = body

  if (!sourceScriptId || !name || !Array.isArray(sections) || !Array.isArray(criteria)) {
    return Response.json(
      { data: null, error: { message: 'sourceScriptId, name, sections and criteria are required', code: 400 } },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: source, error: sourceErr } = await admin
    .from('scripts')
    .select('id, rubric_id, rubric_version_snapshot, minor_version')
    .eq('id', sourceScriptId)
    .single()

  if (sourceErr || !source) {
    return Response.json(
      { data: null, error: { message: 'Source script not found', code: 404 } },
      { status: 404 },
    )
  }

  const nextMinor = ((source.minor_version as number | null) ?? 0) + 1

  const newScript = await dbCreateScript({
    rubricId: source.rubric_id as string,
    name,
    description: description ?? undefined,
    sections,
    criteria,
    full_script: full_script ?? undefined,
    isActive: false,
  })

  await admin
    .from('scripts')
    .update({
      rubric_version_snapshot: source.rubric_version_snapshot,
      minor_version: nextMinor,
    })
    .eq('id', newScript.id)

  return ok({
    id: newScript.id,
    name: newScript.name,
    minor_version: nextMinor,
  })
}
