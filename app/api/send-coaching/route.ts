import { Resend } from 'resend'
import { buildCoachingEmail, type CoachingEmailSection } from '@/lib/email/coaching-template'
import { getActiveOrgContext, getRole, getSession, requireOwnerWrite, unauthorized, forbidden } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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

// POST /api/send-coaching
//   Dispara email de coaching pro trainer após uma call ser analisada.
//   Auth: logado + Owner (trainer não dispara coaching de outros trainers)
//   + caller pertence à mesma org do trainer destinatário.
//   trainerEmail deve corresponder a um user com trainers row em
//   active_org_id do caller. Sem esse check, anyone-logged-in podia mandar
//   email arbitrário pra qualquer email (spam / phishing vector).
//   Admin impersonando é bloqueado (read-only).
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  // requireOwnerWrite só barra admin impersonando — trainer logado ainda
  // passaria. Mesma checagem de papel das demais rotas de escrita.
  const role = await getRole()
  if (role === 'trainer') return forbidden()

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

    if (!trainerEmail) {
      return Response.json({ error: 'trainerEmail é obrigatório' }, { status: 400 })
    }

    const ctx = await getActiveOrgContext()
    if (!ctx?.activeOrgId) return forbidden()

    // Trainer destinatário precisa estar na mesma org do caller. Pre-merge
    // o lookup ia users.email → users.id → trainers.org_id; com migration
    // 040 trainers tem RLS habilitado, mas usamos createAdminClient pra
    // não depender do request context (a regra de pertencimento já é
    // verificada explicitamente abaixo).
    const admin = createAdminClient()
    const { data: trainerOwner } = await admin
      .from('users')
      .select('id, trainers!inner(org_id)')
      .eq('email', trainerEmail.toLowerCase())
      .eq('trainers.org_id', ctx.activeOrgId)
      .maybeSingle()
    if (!trainerOwner) {
      return Response.json(
        { error: 'Trainer não pertence à sua organização' },
        { status: 403 },
      )
    }

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
