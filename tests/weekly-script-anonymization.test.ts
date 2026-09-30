/**
 * Checagem de anonimização do script semanal da rede.
 *
 * O prompt manda anonimizar; este código confere. Valor monetário ou nome de
 * org incluída / trainer / lead das calls usadas → a rodada vira erro com o
 * trecho, e nada é gravado nem enviado (ver weekly-script-suggestion.test.ts).
 *
 * Os nomes de teste reproduzem os formatos reais do CRM (30/09/2026): tab no
 * meio, inicial solta, cão e raça dentro do nome do lead, rep de sistema.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/constants/front-desk', () => ({ FRONT_DESK_NAME: 'Front Desk - AskMoses' }))

import {
  buildAnonymizationTerms,
  describeLeak,
  findAnonymizationLeak,
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
  }
}

const included = [
  {
    orgName: 'Stay Focused Dog Training LLC',
    calls: [
      { trainerName: 'Austin Ackerman', clientName: 'Cheryl SADIE Golden Retriever Davis' },
      { trainerName: 'Michael\tMiller', clientName: null },
      { trainerName: 'Kurt D', clientName: '—' },
      { trainerName: 'Front Desk - AskMoses', clientName: null },
    ],
  },
  { orgName: "Xena's Pack", calls: [{ trainerName: 'Xena Lamp', clientName: 'Erin XENA Giant Schnauzer Schlichter' }] },
]
const terms = buildAnonymizationTerms(included)
const termSet = (kind: string) => terms.filter((t) => t.kind === kind).map((t) => t.term).sort()

describe('buildAnonymizationTerms', () => {
  it('org: nome completo e sem sufixo societário', () => {
    expect(termSet('org')).toEqual(['Stay Focused Dog Training', 'Stay Focused Dog Training LLC', "Xena's Pack"])
  })

  it('pessoa: nome completo + primeiro e último nome; espaço/tab normalizado', () => {
    expect(termSet('trainer')).toEqual(
      ['Ackerman', 'Austin', 'Austin Ackerman', 'Kurt', 'Kurt D', 'Lamp', 'Michael', 'Michael Miller', 'Miller', 'Xena', 'Xena Lamp'].sort(),
    )
  })

  it('lead: cão e raça no meio do nome NÃO viram termo (só primeiro/último)', () => {
    const leads = termSet('lead')
    expect(leads).toContain('Cheryl')
    expect(leads).toContain('Davis')
    expect(leads).not.toContain('Golden')
    expect(leads).not.toContain('Retriever')
    expect(leads).not.toContain('Schnauzer')
  })

  it('placeholders de sistema e vazios não viram termo', () => {
    const all = terms.map((t) => t.term.toLowerCase())
    expect(all).not.toContain('front desk - askmoses')
    expect(all).not.toContain('front')
    expect(all).not.toContain('—')
    expect(all).not.toContain('d') // inicial solta de "Kurt D"
  })

  it('org com nome curto (< 3) não vira termo', () => {
    expect(buildAnonymizationTerms([{ orgName: 'A', calls: [] }])).toEqual([])
  })
})

describe('findAnonymizationLeak — valores monetários', () => {
  it.each([
    ['$150', 'The program is $150 per session.'],
    ['$1,200', 'Package costs $1,200.'],
    ['US$ 99', 'Only US$ 99 today.'],
    ['R$ 300', 'Apenas R$ 300.'],
    ['€50', 'Deposit of €50.'],
    ['£30', 'It is £30.'],
    ['$2k', 'Around $2k total.'],
    ['150 dollars', 'That is 150 dollars.'],
    ['99 bucks', 'Just 99 bucks.'],
    ['500 USD', 'Costs 500 USD.'],
  ])('barra %s', (_label, text) => {
    const leak = findAnonymizationLeak(script({ instructions: [text] }), [])
    expect(leak).toMatchObject({ kind: 'money', field: 'sections[Discovery].instructions' })
  })

  it.each([
    'Share the investment: [price].',
    'Quote $[price] for the program.',
    'Most owners see results in 6 weeks.',
    'Offer a 10% discount only if needed.',
  ])('não barra: %s', (text) => {
    expect(findAnonymizationLeak(script({ instructions: [text] }), [])).toBeNull()
  })
})

describe('findAnonymizationLeak — nomes', () => {
  it('trainer pelo primeiro nome, sem diferenciar maiúsculas', () => {
    const leak = findAnonymizationLeak(script({ instructions: ['Hi, this is AUSTIN from the team.'] }), terms)
    expect(leak).toMatchObject({ kind: 'trainer', term: 'Austin' })
    expect(leak!.excerpt).toContain('this is AUSTIN from')
  })

  it('lead pelo sobrenome', () => {
    expect(findAnonymizationLeak(script({ full_script: 'Thanks, Mrs. Davis!' }), terms)).toMatchObject({
      kind: 'lead',
      term: 'Davis',
      field: 'full_script',
    })
  })

  it('org pelo nome sem sufixo', () => {
    expect(
      findAnonymizationLeak(script({ description: 'Built from Stay Focused Dog Training calls' }), terms),
    ).toMatchObject({ kind: 'org', field: 'description' })
  })

  it('org com apóstrofo', () => {
    expect(findAnonymizationLeak(script({ name: "Xena's Pack Closing Script" }), terms)).toMatchObject({ kind: 'org' })
  })

  it('palavras inteiras: "Davison" e "Austinite" não casam com Davis/Austin', () => {
    expect(
      findAnonymizationLeak(script({ instructions: ['Mention Davison street and the Austinite crowd.'] }), terms),
    ).toBeNull()
  })

  it('nome com espaço/tab no CRM casa com espaço simples no texto', () => {
    expect(findAnonymizationLeak(script({ full_script: 'Ask for Michael Miller.' }), terms)).toMatchObject({
      term: 'Michael Miller',
    })
  })

  it('raça no nome do lead não barra o texto de adestramento', () => {
    expect(
      findAnonymizationLeak(script({ instructions: ['Golden Retriever and Giant Schnauzer owners often ask about leash pulling.'] }), terms),
    ).toBeNull()
  })

  it('script limpo → null', () => {
    expect(findAnonymizationLeak(script(), terms)).toBeNull()
  })
})

describe('describeLeak', () => {
  it('motivo com tipo, termo, campo e trecho', () => {
    const leak = findAnonymizationLeak(script({ instructions: ['Close at $499 today.'] }), terms)!
    expect(describeLeak(leak)).toBe(
      'Anonimização: valor monetário "$499" em sections[Discovery].instructions: "Close at $499 today."',
    )
  })
})
