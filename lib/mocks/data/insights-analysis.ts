import type { Call } from '@/lib/types'

/**
 * Gera a resposta mock do POST /api/insights (análise de padrões via LLM).
 * Na Fase 2 isso será substituído por chamada real ao GPT-4o.
 */
export function buildInsightsAnalysis(calls: Call[]) {
  const closedCalls = calls.filter((c) => c.result === 'closed')
  const notClosedCalls = calls.filter((c) => c.result === 'no-close')
  const partialCalls = calls.filter((c) => c.result === 'follow-up')

  return {
    metrics: {
      total: calls.length,
      closed: closedCalls.length,
      notClosed: notClosedCalls.length,
      partial: partialCalls.length,
      closeRate: Math.round((closedCalls.length / calls.length) * 100),
    },
    successPatterns: [
      'Fazem pelo menos 3 perguntas abertas antes de apresentar a oferta',
      'Identificam a dor real (emocional) antes de falar de preço',
      'Usam prova social com raça e problema similares ao do prospecto',
      'Criam urgência real sem pressão artificial',
      'Mantêm silêncio estratégico após apresentar o preço',
    ],
    failurePatterns: [
      'Pulam direto para a apresentação da oferta sem discovery',
      'Respondem objeções de preço de forma defensiva',
      'Oferecem desconto antes de explorar outras saídas',
      'Encerram a call sem próximo passo definido',
      'Discovery superficial — menos de 2 perguntas abertas',
    ],
    partialPatterns: [
      'Discovery bom mas follow-up sem data/hora definida',
      'Não identificam co-decisores no início da call',
      'Perdem o controle da conversa na fase de objeção',
    ],
    keyDifferences: [
      'Closers fazem 3-4 perguntas abertas vs. 1-2 dos não-closers',
      'Closers conectam o problema a custos emocionais e financeiros',
      'Closers nunca oferecem desconto como primeira resposta à objeção',
      'Closers definem próximos passos claros em 100% das calls',
      'Não-closers entram em modo "justificativa" quando o preço é questionado',
    ],
    dos: [
      'Faça pelo menos 3 perguntas abertas antes de qualquer apresentação',
      'Identifique a dor real em menos de 5 minutos',
      'Conecte o problema a impactos emocionais e financeiros',
      'Use ROI concreto: "quanto custa NÃO resolver isso?"',
      'Apresente a oferta como solução exata para a dor identificada',
      'Mantenha silêncio estratégico após apresentar o preço',
      'Defina próximo passo com data e hora',
      'Identifique co-decisores no início da call',
    ],
    donts: [
      'Não pule o discovery para ir direto à oferta',
      'Não ofereça desconto antes de explorar a objeção',
      'Não entre em modo defensivo quando o preço for questionado',
      'Não encerre a call sem compromisso claro',
      'Não use perguntas fechadas no discovery',
      'Não apresente preço antes de estabelecer valor',
    ],
    commonObjections: [
      {
        objection: 'O investimento está acima do que eu planejei',
        frequency: 'Very Common',
        bestResponse: 'Quanto está custando NÃO resolver isso? O sofá destruído, as idas ao vet, a restrição de viajar...',
        worstResponse: 'Entendo, mas o nosso programa tem excelente custo-benefício comparado a...',
      },
      {
        objection: 'Preciso falar com meu marido/esposa primeiro',
        frequency: 'Common',
        bestResponse: 'Faz total sentido. Que tal incluir ele(a) na próxima conversa? Posso agendar para terça às 19h?',
        worstResponse: 'Ok, vou te mandar o material para você mostrar.',
      },
      {
        objection: 'Vou pensar e te retorno',
        frequency: 'Very Common',
        bestResponse: 'Claro. O que exatamente você precisa pensar? Talvez eu consiga ajudar com essa dúvida agora.',
        worstResponse: 'Claro, sem problemas. Fico no aguardo.',
      },
    ],
    preCallChecklist: [
      'Revisar nome do prospecto e do cão',
      'Preparar 3 perguntas abertas de discovery',
      'Ter cases de sucesso prontos por raça',
      'Definir mentalmente o preço-âncora',
      'Preparar resposta para objeção de preço sem desconto',
      'Ter agenda aberta para marcar follow-up se necessário',
      'Lembrar: silêncio após o preço',
      'Objetivo: identificar a dor em 5 minutos',
    ],
    suggestedScript: 'Script otimizado baseado nas calls de sucesso...',
    trainers: [
      { name: 'Marcus R.', email: 'marcusr@demo.askmoses.ai' },
      { name: 'Jamie L.', email: 'jamiel@demo.askmoses.ai' },
      { name: 'Jordan K.', email: 'jordank@demo.askmoses.ai' },
      { name: 'Taylor M.', email: 'taylorm@demo.askmoses.ai' },
    ],
  }
}
