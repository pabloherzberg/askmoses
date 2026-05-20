export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMockImprovement } from '@/lib/scripts/mock-improvement'
import type { DbScript } from '@/lib/db/scripts'
import { ScriptReviewDetailClient } from './ScriptReviewDetailClient'

interface PageProps {
  params: Promise<{ scriptId: string; locale: string }>
}

// Detalhe de revisão de script — mostra o diff entre o script base e a
// versão "melhorada pela IA" (mock na Fase 1, ver lib/scripts/mock-improvement).
// Layout (admin) já garante role=admin via middleware.
export default async function ScriptReviewDetailPage({ params }: PageProps) {
  const { scriptId } = await params

  const admin = createAdminClient()
  const { data: script } = await admin
    .from('scripts')
    .select('*, rubric_version_snapshot, minor_version')
    .eq('id', scriptId)
    .maybeSingle()

  if (!script) notFound()

  const row = script as unknown as DbScript & {
    rubric_version_snapshot: number | null
    minor_version: number | null
  }
  const baseVersion = `${row.rubric_version_snapshot ?? 1}.${row.minor_version ?? 0}`

  const review = buildMockImprovement(row, baseVersion)

  return <ScriptReviewDetailClient review={review} />
}
