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
 *  9. Cópias da org em BCC (migration 126): com e sem lista, rep na lista,
 *     override ativo, coluna inexistente
 * 10. Conteúdo: Buying Intent com os 4 sinais, sem breakdown, transcrição
 *     com caracteres HTML escapados
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted garante que as variáveis estejam disponíveis no momento do hoist
// dos vi.mock (que rodam antes de qualquer import).
const {
  mockDbGetCallById,
  mockDbUpdateGhlCallPipeline,
  mockResendSend,
  mockDbGetTrainerById,
  mockDbGetTrainerDeliverability,
  mockDbGetOrgCoachingCopyEmails,
} = vi.hoisted(() => ({
  mockDbGetCallById: vi.fn(),
  mockDbUpdateGhlCallPipeline: vi.fn(),
  mockResendSend: vi.fn(),
  mockDbGetTrainerById: vi.fn(),
  mockDbGetTrainerDeliverability: vi.fn(),
  mockDbGetOrgCoachingCopyEmails: vi.fn(),
}))

vi.mock('@/lib/db/calls', () => ({
  dbGetCallById: mockDbGetCallById,
  dbUpdateGhlCallPipeline: mockDbUpdateGhlCallPipeline,
}))

vi.mock('@/lib/db/trainers', () => ({
  dbGetTrainerById: mockDbGetTrainerById,
  dbGetTrainerDeliverability: mockDbGetTrainerDeliverability,
}))

vi.mock('@/lib/db/organizations', () => ({
  dbGetOrgCoachingCopyEmails: mockDbGetOrgCoachingCopyEmails,
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
    org_id: 'org-1',
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
    mockDbGetOrgCoachingCopyEmails.mockResolvedValue([])
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

  // ── Gate de destinatário (Front Desk / convite pendente) ──────────────────

  it('skip se a call é do Front Desk, MESMO com trainer_email preenchido', async () => {
    // O endereço no payload pode ser o de alguém que nem está na plataforma —
    // é justamente quando o campo está preenchido que existe risco de mandar
    // coaching não solicitado pra um terceiro.
    mockDbGetCallById.mockResolvedValue(
      makeCall({ trainer_id: 'front-desk-id', trainer_email: 'estranho@externo.com' }),
    )
    mockDbGetTrainerDeliverability.mockResolvedValue({ isSystem: true, inviteAccepted: true })

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockDbUpdateGhlCallPipeline).not.toHaveBeenCalled()
  })

  it('skip se o trainer ainda não aceitou o convite', async () => {
    // Receber a análise da própria call antes de ter login é estranho. Como
    // email_sent fica false, dá pra disparar retroativamente no aceite.
    mockDbGetCallById.mockResolvedValue(makeCall({ trainer_id: 'rep-1' }))
    mockDbGetTrainerDeliverability.mockResolvedValue({ isSystem: false, inviteAccepted: false })

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).not.toHaveBeenCalled()
    expect(mockDbUpdateGhlCallPipeline).not.toHaveBeenCalled()
  })

  it('envia normalmente para trainer real com convite aceito', async () => {
    mockDbGetCallById.mockResolvedValue(makeCall({ trainer_id: 'rep-1' }))
    mockDbGetTrainerDeliverability.mockResolvedValue({ isSystem: false, inviteAccepted: true })

    await sendGhlCoachingEmail('call-abc')

    expect(mockResendSend).toHaveBeenCalledOnce()
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

  // ── Cópias da org em BCC (migration 126) ──────────────────────────────────

  describe('cópias da org (BCC)', () => {
    it('sem lista: envia só para o rep, sem campo bcc', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall())

      await sendGhlCoachingEmail('call-abc')

      expect(mockDbGetOrgCoachingCopyEmails).toHaveBeenCalledWith('org-1')
      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0].to).toBe('trainer@example.com')
      expect(sendArgs[0]).not.toHaveProperty('bcc')
    })

    it('com lista: manda as cópias em BCC no mesmo envio', async () => {
      mockDbGetOrgCoachingCopyEmails.mockResolvedValue(['owner@k9.com', 'manager@k9.com'])
      mockDbGetCallById.mockResolvedValue(makeCall())

      await sendGhlCoachingEmail('call-abc')

      expect(mockResendSend).toHaveBeenCalledOnce()
      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0].to).toBe('trainer@example.com')
      expect(sendArgs[0].bcc).toEqual(['owner@k9.com', 'manager@k9.com'])
      expect(mockDbUpdateGhlCallPipeline).toHaveBeenCalledWith('call-abc', {
        emailSent: true,
        emailId: 'resend-email-id-001',
      })
    })

    it('tira o email do próprio rep da lista (sem diferenciar maiúsculas)', async () => {
      mockDbGetOrgCoachingCopyEmails.mockResolvedValue(['trainer@example.com', 'owner@k9.com'])
      mockDbGetCallById.mockResolvedValue(makeCall({ trainer_email: 'Trainer@Example.com' }))

      await sendGhlCoachingEmail('call-abc')

      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0].bcc).toEqual(['owner@k9.com'])
    })

    it('lista só com o rep: nenhum bcc', async () => {
      mockDbGetOrgCoachingCopyEmails.mockResolvedValue(['trainer@example.com'])
      mockDbGetCallById.mockResolvedValue(makeCall())

      await sendGhlCoachingEmail('call-abc')

      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0]).not.toHaveProperty('bcc')
    })

    it('DEV_EMAIL_OVERRIDE ativo: não envia cópias nem lê a lista', async () => {
      process.env.DEV_EMAIL_OVERRIDE = 'dev@askmoses.ai'
      mockDbGetOrgCoachingCopyEmails.mockResolvedValue(['owner@k9.com'])
      mockDbGetCallById.mockResolvedValue(makeCall())

      await sendGhlCoachingEmail('call-abc')

      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0].to).toBe('dev@askmoses.ai')
      expect(sendArgs[0]).not.toHaveProperty('bcc')
      expect(mockDbGetOrgCoachingCopyEmails).not.toHaveBeenCalled()
    })

    it('coluna inexistente (migration 126 não aplicada): envia sem cópias', async () => {
      mockDbGetOrgCoachingCopyEmails.mockRejectedValue(
        new Error('dbGetOrgCoachingCopyEmails: column organizations.coaching_copy_emails does not exist'),
      )
      mockDbGetCallById.mockResolvedValue(makeCall())

      await expect(sendGhlCoachingEmail('call-abc')).resolves.toBeUndefined()

      expect(mockResendSend).toHaveBeenCalledOnce()
      const [sendArgs] = mockResendSend.mock.calls
      expect(sendArgs[0].to).toBe('trainer@example.com')
      expect(sendArgs[0]).not.toHaveProperty('bcc')
      expect(mockDbUpdateGhlCallPipeline).toHaveBeenCalledWith('call-abc', {
        emailSent: true,
        emailId: 'resend-email-id-001',
      })
    })

    it('call sem org_id: não consulta a lista', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall({ org_id: null }))

      await sendGhlCoachingEmail('call-abc')

      expect(mockDbGetOrgCoachingCopyEmails).not.toHaveBeenCalled()
      expect(mockResendSend).toHaveBeenCalledOnce()
    })

    it('Front Desk continua bloqueado mesmo com lista de cópias', async () => {
      mockDbGetOrgCoachingCopyEmails.mockResolvedValue(['owner@k9.com'])
      mockDbGetCallById.mockResolvedValue(makeCall({ trainer_id: 'front-desk-id' }))
      mockDbGetTrainerDeliverability.mockResolvedValue({ isSystem: true, inviteAccepted: true })

      await sendGhlCoachingEmail('call-abc')

      expect(mockResendSend).not.toHaveBeenCalled()
    })
  })

  // ── Conteúdo: Buying Intent e transcrição ─────────────────────────────────

  describe('conteúdo do email', () => {
    const htmlOf = () => mockResendSend.mock.calls[0][0].html as string
    // O título renderizado (o template tem um comentário <!-- Buying Intent --> fixo).
    const INTENT_TITLE = />\s*Buying Intent\s*</

    it('intent completo: nota calculada e os 4 sinais', async () => {
      // Pesos default (25/25/25/25): média 7 → índice 3.5 → template arredonda para 4/5.
      mockDbGetCallById.mockResolvedValue(
        makeCall({
          intent: 1,
          intentBreakdown: { financial: 8, urgency: 6, authority: 10, engagement: 4 },
          intentWeights: null,
        }),
      )

      await sendGhlCoachingEmail('call-abc')

      const html = htmlOf()
      expect(html).toMatch(INTENT_TITLE)
      expect(html).toContain('4/5')
      for (const name of ['Financial', 'Urgency', 'Authority', 'Engagement']) {
        expect(html).toContain(name)
      }
      // Sinal 0-10 → seção 0-100 → exibição 0-5 (financial 8 → 4.0/5, authority 10 → 5.0/5).
      expect(html).toContain('4.0/5')
      expect(html).toContain('5.0/5')
    })

    it('sem breakdown: usa calls.intent e não mostra os sinais', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall({ intent: 3, intentBreakdown: null }))

      await sendGhlCoachingEmail('call-abc')

      const html = htmlOf()
      expect(html).toMatch(INTENT_TITLE)
      expect(html).toContain('3/5')
      expect(html).not.toContain('Financial')
    })

    it('breakdown vazio ({}) conta como ausente: sem sinais zerados', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall({ intent: 2, intentBreakdown: {} }))

      await sendGhlCoachingEmail('call-abc')

      const html = htmlOf()
      expect(html).toContain('2/5')
      expect(html).not.toContain('Financial')
    })

    it('sem breakdown e sem intent: não mostra o bloco de Buying Intent', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall({ intent: null, intentBreakdown: null }))

      await sendGhlCoachingEmail('call-abc')

      expect(htmlOf()).not.toMatch(INTENT_TITLE)
    })

    it('transcrição com caracteres HTML sai escapada, uma fala por linha', async () => {
      mockDbGetCallById.mockResolvedValue(
        makeCall({
          transcript: 'Rep: <script>alert("x")</script> & more\n\n  Client: price <$500> ok  ',
        }),
      )

      await sendGhlCoachingEmail('call-abc')

      const html = htmlOf()
      expect(html).toContain('Call transcript')
      expect(html).not.toContain('<script>')
      expect(html).toContain(
        'Rep: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more<br>Client: price &lt;$500&gt; ok',
      )
    })

    it('sem transcrição: não mostra o bloco', async () => {
      mockDbGetCallById.mockResolvedValue(makeCall({ transcript: null }))

      await sendGhlCoachingEmail('call-abc')

      expect(htmlOf()).not.toContain('Call transcript')
    })
  })
})
