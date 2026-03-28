/**
 * Dados mock para POST /api/analyze (análise de uma call individual).
 * Na Fase 2 será substituído por chamada real ao GPT-4o.
 */

interface AnalysisProfile {
  scores: number[]
  overall: number
  detected: string
}

interface AnalysisSummary {
  summary: string
  strengths: string[]
  improvements: string[]
}

// Scores base variam por outcome
export const outcomeProfiles: Record<string, AnalysisProfile> = {
  closed: {
    scores: [5, 4, 5, 4, 5],
    overall: 92,
    detected: 'closed',
  },
  follow_up: {
    scores: [4, 4, 4, 3, 3],
    overall: 72,
    detected: 'partial',
  },
  objection_unresolved: {
    scores: [4, 3, 3, 2, 2],
    overall: 56,
    detected: 'not_closed',
  },
  no_decision: {
    scores: [3, 2, 3, 2, 1],
    overall: 44,
    detected: 'not_closed',
  },
}

function buildSectionFeedback(name: string, score: number): string {
  const feedbacks: Record<string, [string, string, string]> = {
    'Discovery': [
      'Excelente exploração com perguntas abertas. Identificou a dor real rapidamente.',
      'Discovery razoável, mas com poucas perguntas abertas antes de apresentar a oferta.',
      'Discovery insuficiente — pulou direto para a apresentação sem explorar a dor.',
    ],
    'Problem Agitation': [
      'Conectou o problema a impactos emocionais e financeiros com maestria.',
      'Agitação parcial — mencionou impactos mas sem aprofundar.',
      'Praticamente não houve agitação do problema. O prospecto não sentiu urgência.',
    ],
    'Offer Presentation': [
      'Oferta apresentada como solução exata para a dor identificada.',
      'Apresentação funcional mas desconectada da dor do prospecto.',
      'Oferta genérica, sem conexão com o que foi discutido no discovery.',
    ],
    'Objection Handling': [
      'Objeções manejadas com reframing eficaz, sem entrar na defensiva.',
      'Tentou contornar objeções mas cedeu rápido demais.',
      'Entrou em modo defensivo na primeira objeção. Ofereceu desconto prematuramente.',
    ],
    'Close & Next Steps': [
      'Fechamento seguro com próximos passos claros e data definida.',
      'Próximos passos definidos mas vagos, sem data/hora.',
      'Call encerrada sem compromisso claro. Prospecto saiu sem próximo passo.',
    ],
    'Objection Classification': [
      'Identificou corretamente o tipo de objeção (preço) e ajustou a abordagem.',
      'Classificou a objeção mas demorou a reagir.',
      'Não identificou a objeção real — tratou como resistência genérica.',
    ],
    'Reframing Technique': [
      'Recontextualizou o investimento em termos de custo de inação com sucesso.',
      'Tentou reframing mas voltou a justificar o preço.',
      'Sem reframing. Entrou direto em modo de justificativa de preço.',
    ],
    'Social Proof': [
      'Usou case específico com raça e problema similar ao do prospecto.',
      'Mencionou casos de sucesso mas sem especificidade.',
      'Não usou prova social em nenhum momento da call.',
    ],
  }

  const fb = feedbacks[name] || ['Bom.', 'Razoável.', 'Precisa melhorar.']
  if (score >= 4) return fb[0]
  if (score >= 3) return fb[1]
  return fb[2]
}

export function buildDiscoverySections(scores: number[]) {
  const names = ['Discovery', 'Problem Agitation', 'Offer Presentation', 'Objection Handling', 'Close & Next Steps']
  return names.map((name, i) => ({
    name,
    score: scores[i],
    feedback: buildSectionFeedback(name, scores[i]),
  }))
}

export function buildObjectionSections(scores: number[]) {
  const mapping = [
    { name: 'Objection Classification', scoreIdx: 3 },
    { name: 'Reframing Technique', scoreIdx: 1 },
    { name: 'Social Proof', scoreIdx: 2 },
  ]
  return mapping.map(({ name, scoreIdx }) => ({
    name,
    score: scores[scoreIdx],
    feedback: buildSectionFeedback(name, scores[scoreIdx]),
  }))
}

export const summaryByOutcome: Record<string, AnalysisSummary> = {
  closed: {
    summary: 'Call excelente com execução sólida em todas as etapas. O trainer conduziu o prospecto do discovery ao fechamento de forma natural e sem pressão.',
    strengths: [
      'Discovery profundo com 4+ perguntas abertas antes da oferta',
      'Criou urgência real conectando o problema a custos emocionais',
      'Fechamento natural com próximos passos claros e data definida',
    ],
    improvements: [
      'Poderia ter incluído mais prova social durante a apresentação',
    ],
  },
  follow_up: {
    summary: 'Call bem conduzida com bom rapport, mas não fechou. O follow-up foi agendado corretamente. Provavelmente há um co-decisor envolvido.',
    strengths: [
      'Discovery identificou a dor real corretamente',
      'Manteve o engajamento do prospecto durante toda a call',
      'Follow-up marcado com data e hora específicas',
    ],
    improvements: [
      'Identificar co-decisores mais cedo no discovery',
      'Aprofundar o problem agitation para criar mais urgência',
    ],
  },
  objection_unresolved: {
    summary: 'Call com início promissor mas que travou na fase de objeção. O trainer não conseguiu recontextualizar o investimento e entrou em modo defensivo.',
    strengths: [
      'Abertura de call bem feita com bom rapport inicial',
      'Conhece bem o produto e apresentou com clareza',
    ],
    improvements: [
      'Nunca justificar o preço — reframing com custo de inação',
      'Parar de oferecer desconto como primeira resposta',
      'Praticar role-play de objeção de preço com foco em valor',
    ],
  },
  no_decision: {
    summary: 'Call fraca sem direção clara. O prospecto conduziu a conversa e o trainer não conseguiu criar valor suficiente para avançar. Necessidade urgente de coaching.',
    strengths: [
      'Conseguiu manter o prospecto na call',
    ],
    improvements: [
      'Discovery muito superficial — precisava de mais perguntas abertas',
      'Não houve agitação do problema — o prospecto não sentiu urgência',
      'Call encerrada sem nenhum próximo passo ou compromisso',
      'Treinar controle de conversa e técnicas de fechamento',
    ],
  },
}

export const mockGeneratedScript = {
  name: 'Script Gerado - Dog Training Sales',
  description: 'Script otimizado baseado nas transcrições fornecidas.',
  sections: [
    { name: 'Abertura & Rapport', instructions: 'Cumprimente e pergunte o motivo do contato.', tips: 'Seja genuíno.' },
    { name: 'Discovery Profundo', instructions: 'Faça 3+ perguntas abertas antes de qualquer apresentação.', tips: 'Identifique a dor real.' },
    { name: 'Agitação do Problema', instructions: 'Conecte o problema a custos emocionais e financeiros.', tips: '"E como isso afeta..."' },
    { name: 'Apresentação da Oferta', instructions: 'Apresente como solução exata para a dor.', tips: 'Valor antes do preço.' },
    { name: 'Manejo de Objeções', instructions: 'Recontextualize o investimento em termos de custo de inação.', tips: '"Quanto custa NÃO resolver?"' },
    { name: 'Fechamento', instructions: 'Proponha próximo passo claro.', tips: 'Silêncio estratégico após o preço.' },
  ],
  full_script: 'Script completo gerado pela IA...',
  criteria: [
    { name: 'Rapport Building', description: 'Establishes connection in first 2 minutes' },
    { name: 'Open Questions', description: 'At least 3 open questions before presenting' },
    { name: 'Pain Identification', description: 'Identifies real pain, not symptom' },
    { name: 'Value Before Price', description: 'Establishes value before pricing' },
    { name: 'Clear Next Steps', description: 'Call ends with clear commitment' },
  ],
  explanation: 'Script gerado com base nas melhores práticas identificadas nas transcrições fornecidas.',
}

export const mockGeneratedCriteria = {
  criteria: [
    { name: 'Rapport Building', description: 'Trainer establishes genuine connection in the first 2 minutes' },
    { name: 'Open-Ended Discovery', description: 'At least 3 open questions before any product mention' },
    { name: 'Emotional Pain Identification', description: 'Connects problem to emotional/financial impact' },
    { name: 'Value Anchoring', description: 'Establishes value before revealing price' },
    { name: 'Objection Reframing', description: 'Handles objections via reframing, not defending' },
    { name: 'Clear Commitment', description: 'Call ends with specific next step (date/time)' },
  ],
}
