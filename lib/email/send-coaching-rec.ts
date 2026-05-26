import { Resend } from 'resend'
import { buildCoachingRecEmail } from './coaching-rec-template'

// Envio do email de recomendação de coaching. Mesmo padrão de send-invite.ts
// e /api/send-coaching: sem RESEND_API_KEY → modo mock (a demo segue
// funcionando sem credencial real).

export type CoachingRecEmailDelivery = 'sent' | 'mocked' | 'failed'

export interface SendCoachingRecParams {
  to: string
  trainerName: string
  senderName: string
  body: string
  locale?: string
}

export interface SendCoachingRecResult {
  delivery: CoachingRecEmailDelivery
  emailId: string | null
}

export async function sendCoachingRecEmail(
  params: SendCoachingRecParams,
): Promise<SendCoachingRecResult> {
  const { subject, html } = buildCoachingRecEmail({
    trainerName: params.trainerName,
    senderName: params.senderName,
    body: params.body,
    locale: params.locale,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[send-coaching-rec] RESEND_API_KEY ausente — modo mock, email não enviado')
    return { delivery: 'mocked', emailId: `mock-email-${Date.now()}` }
  }

  try {
    const resend = new Resend(apiKey)
    // Em dev, DEV_EMAIL_OVERRIDE redireciona todos os emails pra um endereço só.
    const devOverride = process.env.DEV_EMAIL_OVERRIDE
    const toAddress = devOverride ?? params.to

    const { data, error } = await resend.emails.send({
      from: 'AskMoses.AI <noreply@askmoses.ai>',
      to: toAddress,
      subject,
      html,
    })
    if (error) {
      console.error('[send-coaching-rec] Resend error:', error)
      return { delivery: 'failed', emailId: null }
    }
    return { delivery: 'sent', emailId: data?.id ?? null }
  } catch (err) {
    console.error('[send-coaching-rec] Error:', err)
    return { delivery: 'failed', emailId: null }
  }
}
