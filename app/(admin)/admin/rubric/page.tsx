import { getRubric } from '@/lib/services/rubric'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { RubricConfigClient } from './RubricConfigClient'

export default async function AdminRubricPage() {
  const { sections } = await getRubric()

  const systemPrompt = `You are an expert sales coach for dog training businesses.

Evaluate each call using the following weighted rubric:

1. Discovery (20%) — Identify the prospect's real pain through open-ended questions.
2. Problem Agitation (25%) — Deepen the pain and connect it to emotional/financial consequences.
3. Offer Presentation (20%) — Present the product as the exact solution to the identified pain.
4. Objection Handling (25%) — Handle objections without going defensive or offering premature discounts.
5. Close & Next Steps (10%) — End every call with a clear commitment or next step.

Score each section from 0–100. Provide specific, actionable feedback for each section.
Return the response as structured JSON.`

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>Rubric Config</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          Rubric Configuration
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--am-muted)' }}>
          Manage evaluation criteria sent to the AI on every call analysis.
        </p>
      </div>

      <RubricConfigClient sections={sections} systemPrompt={systemPrompt} />
    </div>
  )
}
