/**
 * Anonimização do script semanal da rede — substituição feita pelo código.
 *
 * O prompt manda anonimizar; o código troca o que escapou antes de gravar:
 * valor monetário → [price], org incluída → [business name], trainer/lead
 * das calls usadas → [name]. A rodada não é barrada; o registro guarda tipo,
 * campo e quantidade, nunca o termo original.
 *
 * Os nomes de teste reproduzem os formatos reais do CRM (30/09/2026): tab no
 * meio, inicial solta, cão e raça dentro do nome do lead, rep de sistema.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/constants/front-desk', () => ({ FRONT_DESK_NAME: 'Front Desk - AskMoses' }))

import {
  COMMON_WORD_NAMES,
  buildAnonymizationTerms,
  redactScript,
} from '@/lib/script-intelligence/weekly-anonymization'

const SECTIONS = ['Discovery', 'Problem Agitation', 'Offer Presentation', 'Objection Handling', 'Close & Next Steps']

function script(overrides: { instructions?: string[]; full_script?: string; name?: string; description?: string } = {}) {
  return {
    name: overrides.name ?? 'Network Script',
    description: overrides.description ?? 'Patterns from winning calls',
    sections: SECTIONS.map((name, i) => ({
      name,
      instructions: overrides.instructions?.[i] ?? `Ask about the dog's behavior and goals (${i}).`,
      tips: 'Listen more than you talk.',
      weight: 20,
      critical: false,
    })),
    full_script: overrides.full_script ?? 'Discovery ... Close & Next Steps',
    explanation: 'why',
  }
}

const included = [
  {
    orgName: 'Stay Focused Dog Training LLC',
    calls: [
      { trainerName: 'Austin Ackerman', clientName: 'Cheryl SADIE Golden Retriever Davis' },
      { trainerName: 'Michael\tMiller', clientName: 'MATTHEW STIFF' },
      { trainerName: 'Kurt D', clientName: 'Leslie White' },
      { trainerName: 'Front Desk - AskMoses', clientName: '—' },
    ],
  },
  { orgName: "Xena's Pack", calls: [{ trainerName: 'Xena Lamp', clientName: 'Jane Stiff' }] },
]
const terms = buildAnonymizationTerms(included)
const termList = () => terms.map((t) => t.term)

const first = (r: ReturnType<typeof redactScript>) => (r.script.sections as { instructions: string }[])[0].instructions

describe('buildAnonymizationTerms', () => {
  it('org: nome completo e sem sufixo societário', () => {
    const orgs = terms.filter((t) => t.kind === 'org').map((t) => t.term).sort()
    expect(orgs).toEqual(['Stay Focused Dog Training', 'Stay Focused Dog Training LLC', "Xena's Pack"])
  })

  it('pessoa: nome completo + primeiro/último; espaço e tab normalizados', () => {
    expect(termList()).toEqual(expect.arrayContaining(['Austin Ackerman', 'Austin', 'Ackerman', 'Michael Miller', 'Michael']))
  })

  it('primeiro/último nome que é palavra comum NÃO vira termo sozinho; o nome completo vira', () => {
    const list = termList().map((t) => t.toLowerCase())
    expect(list).toEqual(expect.arrayContaining(['matthew stiff', 'jane stiff', 'leslie white', 'xena lamp']))
    for (const common of ['stiff', 'white', 'lamp', 'miller']) {
      expect(COMMON_WORD_NAMES.has(common)).toBe(true)
      expect(list).not.toContain(common)
    }
  })

  it('cão e raça no meio do nome do lead não viram termo', () => {
    const list = termList()
    expect(list).toEqual(expect.arrayContaining(['Cheryl', 'Davis']))
    expect(list).not.toContain('Golden')
    expect(list).not.toContain('Retriever')
    expect(list).not.toContain('SADIE')
  })

  it('placeholders de sistema, inicial solta e org curta não viram termo', () => {
    const list = termList().map((t) => t.toLowerCase())
    expect(list).not.toContain('front desk - askmoses')
    expect(list).not.toContain('—')
    expect(list).not.toContain('d')
    expect(buildAnonymizationTerms([{ orgName: 'A', calls: [] }])).toEqual([])
  })

  it('ordena do mais longo para o mais curto (nome completo antes do primeiro nome)', () => {
    const idxFull = termList().indexOf('Austin Ackerman')
    const idxFirst = termList().indexOf('Austin')
    expect(idxFull).toBeLessThan(idxFirst)
  })
})

describe('redactScript — palavras comuns', () => {
  it('"stiff body language" fica intacto', () => {
    const r = redactScript(script({ instructions: ['Watch for stiff body language and a raised tail.'] }), terms)
    expect(first(r)).toBe('Watch for stiff body language and a raised tail.')
    expect(r.redactions).toEqual([])
  })

  it('"Jane Stiff" vira [name]', () => {
    const r = redactScript(script({ instructions: ['Call Jane Stiff back tomorrow.'] }), terms)
    expect(first(r)).toBe('Call [name] back tomorrow.')
    expect(r.redactions).toEqual([{ kind: 'lead', field: 'sections[Discovery].instructions', count: 1 }])
  })

  it('"white noise" e "a lamp" ficam; "Leslie White" vira [name]', () => {
    const r = redactScript(script({ instructions: ['Use white noise near a lamp. Leslie White agreed.'] }), terms)
    expect(first(r)).toBe('Use white noise near a lamp. [name] agreed.')
  })
})

describe('redactScript — valores monetários → [price]', () => {
  it.each([
    ['The program is $150 per session.', 'The program is [price] per session.'],
    ['Package costs $1,200.', 'Package costs [price].'],
    ['Only US$ 99 today.', 'Only [price] today.'],
    ['Apenas R$ 300.', 'Apenas [price].'],
    ['Deposit of €50 or £30.', 'Deposit of [price] or [price].'],
    ['Around $2k total.', 'Around [price] total.'],
    ['That is 150 dollars, or 99 bucks, or 500 USD.', 'That is [price], or [price], or [price].'],
  ])('%s', (input, expected) => {
    expect(first(redactScript(script({ instructions: [input] }), []))).toBe(expected)
  })

  it.each([
    'Share the investment: [price].',
    'Most owners see results in 6 weeks.',
    'Offer a 10% discount only if needed.',
  ])('não mexe em: %s', (text) => {
    const r = redactScript(script({ instructions: [text] }), [])
    expect(first(r)).toBe(text)
    expect(r.redactions).toEqual([])
  })
})

describe('redactScript — nomes', () => {
  it('trainer pelo primeiro nome, sem diferenciar maiúsculas → [name]', () => {
    expect(first(redactScript(script({ instructions: ['Hi, this is AUSTIN from the team.'] }), terms))).toBe(
      'Hi, this is [name] from the team.',
    )
  })

  it('nome completo vira UM [name], não "[name] [name]"', () => {
    expect(first(redactScript(script({ instructions: ['Austin Ackerman will call.'] }), terms))).toBe('[name] will call.')
  })

  it('nome com tab no CRM casa com espaço simples no texto', () => {
    expect(redactScript(script({ full_script: 'Ask for Michael Miller.' }), terms).script.full_script).toBe('Ask for [name].')
  })

  it('org → [business name], com e sem LLC, e com apóstrofo', () => {
    const r = redactScript(
      script({
        description: 'From Stay Focused Dog Training LLC and Stay Focused Dog Training',
        name: "Xena's Pack Closing Script",
      }),
      terms,
    )
    expect(r.script.description).toBe('From [business name] and [business name]')
    expect(r.script.name).toBe('[business name] Closing Script')
  })

  it('palavras inteiras: "Davison" e "Austinite" ficam', () => {
    const text = 'Mention Davison street and the Austinite crowd.'
    expect(first(redactScript(script({ instructions: [text] }), terms))).toBe(text)
  })

  it('raça no texto não é tocada', () => {
    const text = 'Golden Retriever owners often ask about leash pulling.'
    expect(first(redactScript(script({ instructions: [text] }), terms))).toBe(text)
  })
})

describe('redactScript — registro e integridade', () => {
  it('conta por tipo e campo, sem o termo original', () => {
    const r = redactScript(
      script({
        instructions: ['Austin said $150. Cheryl agreed to $200.'],
        full_script: 'Austin again.',
      }),
      terms,
    )
    expect(r.redactions).toEqual(
      expect.arrayContaining([
        { kind: 'money', field: 'sections[Discovery].instructions', count: 2 },
        { kind: 'trainer', field: 'sections[Discovery].instructions', count: 1 },
        { kind: 'lead', field: 'sections[Discovery].instructions', count: 1 },
        { kind: 'trainer', field: 'full_script', count: 1 },
      ]),
    )
    expect(JSON.stringify(r.redactions)).not.toMatch(/Austin|Cheryl|\$150|\$200/)
  })

  it('nomes das seções, pesos e campos extras não mudam; a entrada não é alterada', () => {
    const input = script({ instructions: ['Austin: $150'] })
    const before = JSON.stringify(input)
    const r = redactScript(input, terms)
    expect(JSON.stringify(input)).toBe(before)
    const sections = r.script.sections as { name: string; weight: number }[]
    expect(sections.map((s) => s.name)).toEqual(SECTIONS)
    expect(sections.map((s) => s.weight)).toEqual([20, 20, 20, 20, 20])
    expect(r.script.explanation).toBe('why')
  })

  it('script limpo → sem substituições', () => {
    expect(redactScript(script(), terms).redactions).toEqual([])
  })
})
