// Lista de cópias do email de coaching (organizations.coaching_copy_emails,
// migration 126). Regras únicas, usadas pela API (que é quem garante) e pela
// tela de Members (que só antecipa o erro para o usuário).

export const COACHING_COPY_EMAILS_MAX = 5

// Mesmo critério das rotas de convite/signup (app/api/organizations/route.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CoachingCopyEmailsErrorReason = 'INVALID_EMAIL' | 'DUPLICATE_EMAIL' | 'LIMIT_REACHED'

export type CoachingCopyEmailsValidation =
  | { ok: true; emails: string[] }
  | { ok: false; reason: CoachingCopyEmailsErrorReason; email?: string }

export function normalizeCoachingCopyEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidCoachingCopyEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

/**
 * Valida a lista inteira (o PUT substitui a lista). Normaliza para lowercase e
 * rejeita duplicados depois da normalização ("A@x.com" e "a@x.com" colidem).
 */
export function validateCoachingCopyEmails(input: unknown[]): CoachingCopyEmailsValidation {
  const emails: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') return { ok: false, reason: 'INVALID_EMAIL' }
    const email = normalizeCoachingCopyEmail(raw)
    if (!isValidCoachingCopyEmail(email)) return { ok: false, reason: 'INVALID_EMAIL', email }
    if (emails.includes(email)) return { ok: false, reason: 'DUPLICATE_EMAIL', email }
    emails.push(email)
  }
  if (emails.length > COACHING_COPY_EMAILS_MAX) return { ok: false, reason: 'LIMIT_REACHED' }
  return { ok: true, emails }
}
