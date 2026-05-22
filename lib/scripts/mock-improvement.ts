import type { DbScript, ScriptSection } from '@/lib/db/scripts'

// ════════════════════════════════════════════════════════════════════════
// Mock de "Script Intelligence improvement" pra Fase 1 (demo navegável).
//
// A tela /admin/script-review/[scriptId] mostra um diff entre o script base
// e uma versão "melhorada pela IA". Na Fase 2 isso vem de um endpoint real
// de AI; aqui geramos um improvement DETERMINÍSTICO a partir do script real
// — mesmas sections, com algumas marcadas como modified/new + reasoning
// sintético. Determinístico = mesma entrada sempre gera o mesmo diff, então
// a demo é estável entre reloads.
//
// O conteúdo do mock (reasonings e versão "anterior") é localizado nos 4
// idiomas suportados — `buildMockImprovement` recebe o locale e escolhe o
// conjunto certo, caindo em inglês para qualquer locale desconhecido.
// ════════════════════════════════════════════════════════════════════════

export type SectionChangeType = 'unchanged' | 'modified' | 'new'

export interface ReviewCriterion {
  name: string
  description: string
  isNew: boolean
}

export interface ReviewSection {
  name: string
  instructions: string
  tips: string
  weight: number
  critical: boolean
  changeType: SectionChangeType
  // Reasoning da IA — só preenchido pra modified/new.
  reasoning: string | null
  criteria: ReviewCriterion[]
  // Snapshot do conteúdo anterior — usado pela aba Diff. Null pra 'new'.
  previous: { instructions: string; tips: string } | null
}

export interface ChangeSummaryItem {
  section: string
  type: 'modified' | 'new' | 'weight' | 'tip'
}

export interface ScriptReviewData {
  scriptId: string
  scriptName: string
  baseVersion: string
  newVersion: string
  callsAnalyzed: number
  expectedImpact: number
  sections: ReviewSection[]
  changesSummary: ChangeSummaryItem[]
  metadata: {
    author: string
    date: string
    sectionsCount: number
    criteriaCount: number
  }
}

type MockLocale = 'en' | 'pt' | 'es' | 'fr'

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<MockLocale>(['en', 'pt', 'es', 'fr'])

// Locale → BCP-47 tag usado pra formatar a data do metadata.
const DATE_LOCALE: Record<MockLocale, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
}

// Reasonings sintéticos rotacionados por índice — soam plausíveis sem AI.
const MOCK_REASONINGS: Record<MockLocale, string[]> = {
  en: [
    'Closed-call analysis shows reps who open with explicit purpose-setting book 23% more follow-ups. Tightened the opening to lead with the call goal.',
    'Top performers spend 40% more time on pain discovery before pitching. Added emotional-investment probes to surface stakes earlier.',
    'Objection handling was too scripted — winning calls acknowledge the concern first. Reworded to lead with empathy, then reframe.',
    'Closing language was passive. Updated to assume the next step and offer two concrete time options.',
  ],
  pt: [
    'A análise de calls fechadas mostra que vendedores que abrem definindo o objetivo de forma explícita agendam 23% mais follow-ups. Abertura ajustada para começar pela meta da call.',
    'Os melhores vendedores gastam 40% mais tempo na descoberta da dor antes de apresentar a oferta. Adicionadas perguntas de investimento emocional para expor o que está em jogo mais cedo.',
    'O tratamento de objeções estava engessado demais — calls vencedoras reconhecem a preocupação primeiro. Reescrito para começar pela empatia e então reenquadrar.',
    'A linguagem de fechamento estava passiva. Atualizada para assumir o próximo passo e oferecer duas opções concretas de horário.',
  ],
  es: [
    'El análisis de llamadas cerradas muestra que los vendedores que abren definiendo el objetivo de forma explícita agendan un 23% más de seguimientos. Apertura ajustada para empezar por la meta de la llamada.',
    'Los mejores vendedores dedican un 40% más de tiempo a descubrir el dolor antes de presentar la oferta. Se añadieron preguntas de inversión emocional para sacar a la luz lo que está en juego antes.',
    'El manejo de objeciones era demasiado encorsetado — las llamadas ganadoras reconocen primero la preocupación. Reescrito para empezar con empatía y luego reenfocar.',
    'El lenguaje de cierre era pasivo. Actualizado para asumir el siguiente paso y ofrecer dos opciones concretas de horario.',
  ],
  fr: [
    "L'analyse des appels conclus montre que les commerciaux qui ouvrent en définissant explicitement l'objectif obtiennent 23% de relances en plus. Ouverture resserrée pour commencer par le but de l'appel.",
    'Les meilleurs commerciaux passent 40% de temps en plus sur la découverte de la douleur avant de présenter l\'offre. Ajout de questions d\'investissement émotionnel pour faire émerger les enjeux plus tôt.',
    'Le traitement des objections était trop scripté — les appels gagnants reconnaissent d\'abord la préoccupation. Reformulé pour commencer par l\'empathie, puis recadrer.',
    'Le langage de closing était passif. Mis à jour pour assumer la prochaine étape et proposer deux créneaux horaires concrets.',
  ],
}

// Versões "anteriores" sintéticas — propositalmente mais vagas e curtas que
// o script real (a versão "proposta/IA"). Sem isso o diff mostraria o mesmo
// texto nos dois lados. Rotacionadas por índice.
const MOCK_PREVIOUS: Record<MockLocale, { instructions: string; tips: string }[]> = {
  en: [
    {
      instructions:
        'Greet the prospect and introduce yourself. Mention the company and ask how their day is going before moving on.',
      tips: 'Be friendly and keep it short.',
    },
    {
      instructions:
        'Ask the prospect a few questions about their dog and what kind of help they are looking for.',
      tips: 'Take notes while they talk.',
    },
    {
      instructions:
        'When the prospect raises a concern about price or time, address it and explain the value of the program.',
      tips: 'Stay calm and do not get defensive.',
    },
    {
      instructions:
        'Ask the prospect if they want to move forward and try to schedule the next step.',
      tips: 'Be direct about the next step.',
    },
  ],
  pt: [
    {
      instructions:
        'Cumprimente o prospect e se apresente. Mencione a empresa e pergunte como está o dia dele antes de seguir.',
      tips: 'Seja simpático e seja breve.',
    },
    {
      instructions:
        'Faça ao prospect algumas perguntas sobre o cão dele e que tipo de ajuda ele procura.',
      tips: 'Anote enquanto ele fala.',
    },
    {
      instructions:
        'Quando o prospect levantar uma preocupação sobre preço ou tempo, responda e explique o valor do programa.',
      tips: 'Mantenha a calma e não fique na defensiva.',
    },
    {
      instructions:
        'Pergunte ao prospect se ele quer seguir em frente e tente agendar o próximo passo.',
      tips: 'Seja direto sobre o próximo passo.',
    },
  ],
  es: [
    {
      instructions:
        'Saluda al prospecto y preséntate. Menciona la empresa y pregúntale cómo va su día antes de continuar.',
      tips: 'Sé amable y sé breve.',
    },
    {
      instructions:
        'Hazle al prospecto algunas preguntas sobre su perro y qué tipo de ayuda está buscando.',
      tips: 'Toma notas mientras habla.',
    },
    {
      instructions:
        'Cuando el prospecto plantee una preocupación sobre el precio o el tiempo, atiéndela y explica el valor del programa.',
      tips: 'Mantén la calma y no te pongas a la defensiva.',
    },
    {
      instructions:
        'Pregúntale al prospecto si quiere avanzar e intenta agendar el siguiente paso.',
      tips: 'Sé directo sobre el siguiente paso.',
    },
  ],
  fr: [
    {
      instructions:
        "Saluez le prospect et présentez-vous. Mentionnez l'entreprise et demandez comment se passe sa journée avant de continuer.",
      tips: 'Soyez amical et restez bref.',
    },
    {
      instructions:
        "Posez au prospect quelques questions sur son chien et le type d'aide qu'il recherche.",
      tips: 'Prenez des notes pendant qu\'il parle.',
    },
    {
      instructions:
        'Lorsque le prospect soulève une préoccupation sur le prix ou le temps, traitez-la et expliquez la valeur du programme.',
      tips: 'Restez calme et ne soyez pas sur la défensive.',
    },
    {
      instructions:
        "Demandez au prospect s'il souhaite avancer et essayez de planifier la prochaine étape.",
      tips: 'Soyez direct sur la prochaine étape.',
    },
  ],
}

// Qualquer locale fora dos 4 suportados cai em inglês.
function normalizeLocale(locale: string | undefined): MockLocale {
  return locale && SUPPORTED_LOCALES.has(locale) ? (locale as MockLocale) : 'en'
}

// Bump a versão minor: "2.0" → "2.1". Se não tiver ponto, assume ".1".
function bumpMinor(version: string): string {
  const parts = version.split('.')
  if (parts.length !== 2) return `${version}.1`
  const major = parts[0]
  const minor = Number(parts[1])
  return `${major}.${isFinite(minor) ? minor + 1 : 1}`
}

/**
 * Gera o ScriptReviewData mock a partir de um script real.
 *
 * Regra determinística: sections em índice par (0,2,4…) viram 'modified'
 * com reasoning; a última section ganha uma criterion 'New'. Se o script
 * tem 0 sections, retorna estrutura vazia coerente.
 *
 * `locale` localiza o conteúdo do mock (reasonings, versão anterior, data).
 * Locale desconhecido → inglês.
 */
export function buildMockImprovement(
  script: DbScript,
  baseVersion: string,
  locale: string = 'en',
): ScriptReviewData {
  const lang = normalizeLocale(locale)
  const reasonings = MOCK_REASONINGS[lang]
  const previousVersions = MOCK_PREVIOUS[lang]

  const sections: ScriptSection[] = Array.isArray(script.sections) ? script.sections : []

  const reviewSections: ReviewSection[] = sections.map((sec, i) => {
    const isModified = i % 2 === 0
    const weight = sec.weight ?? Math.round(100 / Math.max(sections.length, 1))
    return {
      name: sec.name,
      // O script real é tratado como a versão "proposta" (v2.1 / IA).
      instructions: sec.instructions,
      tips: sec.tips,
      weight,
      critical: sec.critical ?? false,
      changeType: isModified ? 'modified' : 'unchanged',
      reasoning: isModified ? reasonings[i % reasonings.length] : null,
      // "previous" = versão v2.0 sintética, propositalmente mais fraca que
      // o texto real — assim a aba Diff mostra contraste de verdade.
      previous: isModified
        ? previousVersions[i % previousVersions.length]
        : null,
      criteria: [],
    }
  })

  // Criteria do script ficam concentrados na 1ª section pra demo — o real
  // mapeamento criteria↔section não existe no schema atual.
  const allCriteria = Array.isArray(script.criteria) ? script.criteria : []
  if (reviewSections.length > 0 && allCriteria.length > 0) {
    reviewSections[0].criteria = allCriteria.map((c, idx) => ({
      name: c.name,
      description: c.description,
      // Última criterion marcada como 'New' pra demonstrar o badge.
      isNew: idx === allCriteria.length - 1,
    }))
  }

  const modifiedCount = reviewSections.filter((s) => s.changeType === 'modified').length

  const changesSummary: ChangeSummaryItem[] = reviewSections
    .filter((s) => s.changeType !== 'unchanged')
    .map((s) => ({
      section: s.name,
      type: s.changeType === 'new' ? 'new' : 'modified',
    }))

  return {
    scriptId: script.id,
    scriptName: script.name,
    baseVersion,
    newVersion: bumpMinor(baseVersion),
    // 47 = número fixo plausível pra demo (igual screenshot de referência).
    callsAnalyzed: 47,
    expectedImpact: modifiedCount,
    sections: reviewSections,
    changesSummary,
    metadata: {
      author: 'Script Intelligence AI',
      date: new Date(script.updated_at ?? script.created_at).toLocaleDateString(
        DATE_LOCALE[lang],
        { month: 'long', day: 'numeric', year: 'numeric' },
      ),
      sectionsCount: reviewSections.length,
      criteriaCount: allCriteria.length,
    },
  }
}
