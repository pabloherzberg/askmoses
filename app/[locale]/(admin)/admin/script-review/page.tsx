export const dynamic = 'force-dynamic'

import { GitCompare } from 'lucide-react'
import { getClientsPage } from '@/lib/services/clients'
import { getSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ScriptReviewClient } from './ScriptReviewClient'

const PAGE_SIZE = 25

interface DbRubricNested {
  id: string
  name: string
  version: number | null
}

interface DbScriptRow {
  id: string
  name: string
  description: string | null
  rubric_id: string
  rubric_version_snapshot: number | null
  minor_version: number | null
  created_at: string
  rubrics: DbRubricNested | DbRubricNested[] | null
}

async function getCatalog() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('scripts')
    .select('id, name, description, rubric_id, rubric_version_snapshot, minor_version, created_at, rubrics(id, name, version)')
    .order('rubric_id', { ascending: true })
    .order('rubric_version_snapshot', { ascending: true, nullsFirst: false })
    .order('minor_version', { ascending: true, nullsFirst: false })

  return ((data ?? []) as unknown as DbScriptRow[]).map((row) => {
    const rubricRaw = row.rubrics
    const rubric = Array.isArray(rubricRaw) ? rubricRaw[0] ?? null : rubricRaw
    const major = row.rubric_version_snapshot ?? 1
    const minor = row.minor_version ?? 0
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      rubricId: row.rubric_id,
      rubricName: rubric?.name ?? null,
      rubricVersion: rubric?.version ?? null,
      majorVersion: major,
      minorVersion: minor,
      version: `${major}.${minor}`,
      createdAt: row.created_at,
    }
  })
}

export default async function ScriptReviewPage() {
  await getSession()

  const [initialPage, catalog] = await Promise.all([
    getClientsPage({ page: 1, limit: PAGE_SIZE }),
    getCatalog(),
  ])

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(110,86,255,0.15)', color: 'var(--am-accent2)' }}
          >
            <GitCompare size={16} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
            Script Intelligence Review
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--am-muted)' }}>
          AI analyzes closed calls per org and proposes targeted improvements to existing scripts.
          Review the diff and send the updated version for owner approval.
        </p>
      </div>

      <ScriptReviewClient
        initialRows={initialPage.rows}
        initialTotal={initialPage.total}
        initialPageSize={PAGE_SIZE}
        catalog={catalog}
      />
    </div>
  )
}
