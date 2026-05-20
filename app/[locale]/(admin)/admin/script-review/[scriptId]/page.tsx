export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DbScript, ScriptSection, ScriptCriterion } from '@/lib/db/scripts'
import type { ScriptReviewData, ReviewSection, ChangeSummaryItem } from '@/lib/scripts/mock-improvement'
import { ScriptReviewDetailClient } from './ScriptReviewDetailClient'

interface PageProps {
  params: Promise<{ scriptId: string; locale: string }>
}

function bumpMinor(version: string): string {
  const parts = version.split('.')
  if (parts.length !== 2) return `${version}.1`
  const minor = Number(parts[1])
  return `${parts[0]}.${isFinite(minor) ? minor + 1 : 1}`
}

function buildReviewData(
  script: DbScript,
  baseVersion: string,
  aiResult: {
    name: string
    description: string
    sections: ScriptSection[]
    criteria: ScriptCriterion[]
    full_script: string
    explanation: string
    callsAnalyzed: number
  },
): ScriptReviewData {
  const originalSections: ScriptSection[] = Array.isArray(script.sections) ? script.sections : []
  const originalCriteria: ScriptCriterion[] = Array.isArray(script.criteria) ? script.criteria : []

  const reviewSections: ReviewSection[] = aiResult.sections.map((sec, i) => {
    const orig = originalSections[i]
    const changed = !orig || orig.instructions !== sec.instructions || orig.tips !== sec.tips
    return {
      name: sec.name,
      instructions: sec.instructions,
      tips: sec.tips,
      weight: sec.weight ?? orig?.weight ?? Math.round(100 / Math.max(aiResult.sections.length, 1)),
      critical: sec.critical ?? orig?.critical ?? false,
      changeType: changed ? 'modified' : 'unchanged',
      reasoning: changed ? aiResult.explanation : null,
      criteria: [],
      previous: changed && orig ? { instructions: orig.instructions, tips: orig.tips } : null,
    }
  })

  // Attach criteria to first section (schema keeps them flat — same as mock)
  if (reviewSections.length > 0 && aiResult.criteria.length > 0) {
    reviewSections[0].criteria = aiResult.criteria.map((c, idx) => ({
      name: c.name,
      description: c.description,
      isNew: !originalCriteria[idx] || originalCriteria[idx].name !== c.name,
    }))
  }

  const changesSummary: ChangeSummaryItem[] = reviewSections
    .filter((s) => s.changeType !== 'unchanged')
    .map((s) => ({ section: s.name, type: s.changeType === 'new' ? 'new' : 'modified' }))

  return {
    scriptId: script.id,
    scriptName: aiResult.name,
    baseVersion,
    newVersion: bumpMinor(baseVersion),
    callsAnalyzed: aiResult.callsAnalyzed,
    expectedImpact: changesSummary.length,
    sections: reviewSections,
    changesSummary,
    metadata: {
      author: 'Script Intelligence AI',
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      sectionsCount: reviewSections.length,
      criteriaCount: aiResult.criteria.length,
    },
  }
}

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

  // Call improve endpoint server-side, forwarding the session cookie
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:3000`

  const improveRes = await fetch(`${baseUrl}/api/admin/scripts/improve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ scriptId }),
  }).catch(() => null)

  // Fall back to mock if the AI call fails (network error, missing API key, etc.)
  if (!improveRes || !improveRes.ok) {
    const { buildMockImprovement } = await import('@/lib/scripts/mock-improvement')
    const review = buildMockImprovement(row, baseVersion)
    return <ScriptReviewDetailClient review={review} />
  }

  const json = await improveRes.json()
  if (json.error) {
    const { buildMockImprovement } = await import('@/lib/scripts/mock-improvement')
    const review = buildMockImprovement(row, baseVersion)
    return <ScriptReviewDetailClient review={review} />
  }

  const review = buildReviewData(row, baseVersion, json.data)
  return <ScriptReviewDetailClient review={review} />
}
