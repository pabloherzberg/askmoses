import { Resend } from 'resend'
import { buildCoachingEmail, type CoachingEmailSection } from '@/lib/email/coaching-template'

interface SendCoachingBody {
  trainerName?: string
  trainerEmail?: string
  clientName?: string
  overallScore?: number
  sections?: CoachingEmailSection[]
  strengths?: string[]
  improvements?: string[]
  locale?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendCoachingBody

    const {
      trainerName = 'Trainer',
      trainerEmail,
      clientName,
      overallScore = 0,
      strengths = [],
      improvements = [],
      locale,
    } = body

    const sections: CoachingEmailSection[] = (body.sections ?? []).map(s => ({
      name: s.name ?? (s as unknown as Record<string, unknown>)['criterionName'] as string ?? '',
      score: s.score ?? 0,
      critical: s.critical,
      justification: s.justification,
      feedback: s.feedback,
    }))

    const { subject, html } = buildCoachingEmail({
      trainerName,
      trainerEmail: trainerEmail ?? '',
      clientName,
      overallScore,
      sections,
      strengths,
      improvements,
      locale,
    })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('[send-coaching] RESEND_API_KEY not set — skipping send')
      return Response.json({ success: true, emailId: `mock-email-${Date.now()}` })
    }

    const resend = new Resend(apiKey)

    // In dev, redirect all emails to DEV_EMAIL_OVERRIDE if set
    const devOverride = process.env.DEV_EMAIL_OVERRIDE
    const toAddress = devOverride ?? trainerEmail
    if (!toAddress) {
      return Response.json({ error: 'No recipient email address' }, { status: 400 })
    }

    const { data, error } = await resend.emails.send({
      from: 'AskMoses.AI <noreply@askmoses.ai>',
      to: toAddress,
      subject,
      html,
    })

    if (error) {
      console.error('[send-coaching] Resend error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true, emailId: data?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[send-coaching] Error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
