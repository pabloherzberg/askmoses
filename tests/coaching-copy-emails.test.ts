import { describe, it, expect } from 'vitest'
import { COACHING_COPY_EMAILS_MAX, validateCoachingCopyEmails } from '@/lib/coaching-copy-emails'

describe('validateCoachingCopyEmails', () => {
  it('normaliza para lowercase e tira espaços', () => {
    expect(validateCoachingCopyEmails(['  Owner@K9.com '])).toEqual({ ok: true, emails: ['owner@k9.com'] })
  })

  it('lista vazia é válida (remove todas as cópias)', () => {
    expect(validateCoachingCopyEmails([])).toEqual({ ok: true, emails: [] })
  })

  it('rejeita formato inválido', () => {
    expect(validateCoachingCopyEmails(['not-an-email'])).toMatchObject({ ok: false, reason: 'INVALID_EMAIL' })
    expect(validateCoachingCopyEmails([42])).toMatchObject({ ok: false, reason: 'INVALID_EMAIL' })
  })

  it('rejeita duplicado depois da normalização', () => {
    expect(validateCoachingCopyEmails(['a@x.com', 'A@X.com'])).toEqual({
      ok: false,
      reason: 'DUPLICATE_EMAIL',
      email: 'a@x.com',
    })
  })

  it(`aceita até ${COACHING_COPY_EMAILS_MAX} e rejeita acima`, () => {
    const five = Array.from({ length: COACHING_COPY_EMAILS_MAX }, (_, i) => `m${i}@x.com`)
    expect(validateCoachingCopyEmails(five)).toMatchObject({ ok: true })
    expect(validateCoachingCopyEmails([...five, 'extra@x.com'])).toEqual({ ok: false, reason: 'LIMIT_REACHED' })
  })
})
