import { type NextRequest } from 'next/server'
import {
  outcomeProfiles,
  buildDiscoverySections,
  buildObjectionSections,
  summaryByOutcome,
} from '@/lib/mocks/data/call-analysis'

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>
  const scriptId = body.scriptId as string
  const outcome = body.callOutcome as string

  const profile = outcomeProfiles[outcome] || outcomeProfiles.no_decision
  const isDiscoveryScript = scriptId === 'script-001'

  const sections = isDiscoveryScript
    ? buildDiscoverySections(profile.scores)
    : buildObjectionSections(profile.scores)

  const result = summaryByOutcome[outcome] || summaryByOutcome.no_decision

  return Response.json({
    sections,
    overallScore: profile.overall,
    detectedOutcome: profile.detected,
    summary: result.summary,
    strengths: result.strengths,
    improvements: result.improvements,
    transcript: body.transcript || 'Transcript analisado...',
    scriptId: scriptId || 'script-001',
  })
}
