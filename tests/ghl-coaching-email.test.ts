/**
 * Teste de integração: sendGhlCoachingEmail
 *
 * Verifica se o email de coaching é enviado corretamente após uma call GHL
 * ser analisada. Todos os módulos externos (Resend, DB) são mockados via
 * vi.mock para que o teste rode sem infra real.
 *
 * Casos cobertos:
 *  1. Happy path — email enviado, DB atualizado com email_sent=true
 *  2. Skip se call não encontrada
 *  3. Skip se email já enviado (idempotência)
 *  4. Skip se trainer_email ausente
 *  5. Skip se overall_score ausente (scoring não rodou)
 *  6. Skip silencioso se RESEND_API_KEY não está setado
 *  7. Falha do Resend é logada mas não relançada (best-effort)
 *  8. DEV_EMAIL_OVERRIDE redireciona destinatário
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted garante que as variáveis estejam disponíveis no momento do hoist
// dos vi.mock (que rodam antes de qualquer import).
const { mockDbGetCallById, mockDbUpdateGhlCallPipeline, mockResendSend } = vi.hoisted(() => ({
  mockDbGetCallById: vi.fn(),
  mockDbUpdateGhlCallPipeline: vi.fn(),
  mockResendSend: vi.fn(),
}))

vi.mock('@/lib/db/calls', () => ({
  dbGetCallById: mockDbGetCallById,
  dbUpdateGhlCallPipeline: mockDbUpdateGhlCallPipeline,
}))

// Mock da classe Resend: usa função construtora regular para compatibilidade com `new`.
vi.mock('resend', () => {
  const ResendMock = function (this: { emails: { send: typeof mockResendSend } }) {
    this.emails = { send: mockResendSend }
  }
  return { Resend: ResendMock }
})

// Importa APÓS os mocks estarem registrados
import { sendGhlCoachingEmail } from '@/lib/services/ghl-coaching-email'

// ---------------------------------------------------------------------------

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: 'call-abc',
    email_sent: false,
    trainer_email: 'trainer@example.com',
    trainer_name: 'Marcus R.',
    client_name: 'Rex Adoption',
    overall_score: 82,
    sections: [
      { name: 'Discovery', score: 80, critical: false, feedback: 'Good questions' },
      { name: 'Close & Next Steps', score: 60, critical: true, feedback: 'Rush less' },
    ],
    strengths: ['Built rapport quickly', 'Clear value prop'],
    improvements: ['Follow up on objections', 'Slow down close'],
    ...overrides,
  }
}

describe('sendGhlCoachingEmail', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: 're_test_fake_key_for_integration_test',
    }
    delete process.env.DEV_EMAIL_OVERRIDE

    mockDbUpdateGhlCallPipeline.mockResolvedValue(undefined)
    mockResendSend.mockResolvedValue({ data: { id: 'resend-email-id-001' }, error: null })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // -------------------------------------------------------------------------

  it('envia o email e marca email_sent=true no DB (happy path)', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall())

    await sendGhlCoachingEmail('call-abc')

    // Resend deve ter sido chamado com os campos obrigatórios
    expect(mockResendSend).toHaveBeenCalledOnce()
    const [sendArgs] = mockResendSend.mock.calls
    expect(sendArgs[0]).toMatchObject({
      from: 'AskMoses.AI <noreply@askmoses.ai>',
      to: 'trainer@example.com',
    })
    expect(typeof sendArgs[0].subject).toBe('string')
    expect(sendArgs[0].subject.length).toBeGreaterThan(0)
    expect(typeof sendArgs[0].html).toBe('string')

    // DB deve ser atualizado com emailSent e emailId
    expect(mockDbUpdateGhlCallPipeline).toHaveBeenCalledWith('call-abc', {
      emailSent: true,
      emailId: 'resend-email-id-001',
    })
  })

  it('skip silencioso se call não existe', async () => {
    mockDbGetCallById.mockResolvedValue(null)

    await sendGhlCoachingEmail('call-xyz')

    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockDbUpdateGhlCallPipeline).not.toHaveBeenCalled()
  })

  it('skip se email já foi enviado (idempotência)', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall({ email_sent: true }))

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('skip se trainer_email está ausente', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall({ trainer_email: null }))

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('skip se overall_score está null (scoring não rodou)', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall({ overall_score: null }))

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it('skip silencioso se RESEND_API_KEY não está setado', async () => {
    delete process.env.RESEND_API_KEY
    mockDbGetCallById.mockResolvedValue(makeCall())

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockDbUpdateGhlCallPipeline).not.toHaveBeenCalled()
  })

  it('falha do Resend é logada mas não relançada', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall())
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'invalid_api_key' } })

    // Não deve lançar
    await expect(sendGhlCoachingEmail('call-abc')).resolves.toBeUndefined()

    // DB não deve ser marcado como enviado
    expect(mockDbUpdateGhlCallPipeline).not.toHaveBeenCalled()
  })

  it('DEV_EMAIL_OVERRIDE redireciona o destinatário', async () => {
    process.env.DEV_EMAIL_OVERRIDE = 'dev@askmoses.ai'
    mockDbGetCallById.mockResolvedValue(makeCall())

    await sendGhlCoachingEmail('call-abc')

    const [sendArgs] = mockResendSend.mock.calls
    expect(sendArgs[0].to).toBe('dev@askmoses.ai')
  })

  it('subject contém o score no formato 0-5 e o nome do cliente', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall({ overall_score: 82, client_name: 'Rex Adoption' }))

    await sendGhlCoachingEmail('call-abc')

    const [sendArgs] = mockResendSend.mock.calls
    // overall_score 82 (0-100) → template converte para 4.1/5
    expect(sendArgs[0].subject).toContain('4.1')
    expect(sendArgs[0].subject).toContain('Rex Adoption')
  })
})
