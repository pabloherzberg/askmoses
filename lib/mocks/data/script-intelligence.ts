export interface ScriptSection {
  id: string
  name: string
  score: number
  status: 'strong' | 'weak' | 'missing'
  quote: string | null
  usageStat: string
  isMissingQuote?: boolean
}

export interface AiSuggestion {
  sectionName: string
  action: 'rewrite' | 'add'
  originalQuote: string | null
  suggestedQuote: string
  rationale: string
}

export interface TopCloserPhrase {
  section: string
  uplift: string
  upliftType: 'close' | 'show'
  quote: string
}

export interface ScriptIntelligenceResult {
  totalCalls: number
  healthScore: number
  effectivenessLabel: 'good' | 'roomToImprove' | 'poor'
  revenueLeak: string
  sections: ScriptSection[]
  suggestions: AiSuggestion[]
  topCloserPhrases: TopCloserPhrase[]
}

export function buildScriptIntelligence(): ScriptIntelligenceResult {
  return {
    totalCalls: 113,
    healthScore: 72,
    effectivenessLabel: 'roomToImprove',
    revenueLeak: 'Objection handling and close are your biggest revenue leak. Fixing these two sections could add +$4,200/mo.',
    sections: [
      {
        id: 'opening',
        name: 'Opening',
        score: 81,
        status: 'strong',
        quote: '"Hi [name], thanks for reaching out about training — I\'d love to learn more about your dog. What\'s going on?"',
        usageStat: 'Used in 89% of calls · correlates with +12pts close rate',
      },
      {
        id: 'discovery',
        name: 'Discovery',
        score: 79,
        status: 'strong',
        quote: '"How long have you been dealing with this behavior? What have you tried so far?"',
        usageStat: 'Used in 74% of calls · top closers ask 3+ questions here',
      },
      {
        id: 'offer_presentation',
        name: 'Offer presentation',
        score: 68,
        status: 'weak',
        quote: '"We offer a 6-week program starting at $X per session."',
        usageStat: 'Price mentioned too early in 61% of calls · leads to objections',
      },
      {
        id: 'objection_handling',
        name: 'Objection handling',
        score: 61,
        status: 'weak',
        quote: '"I understand, let me see what we can do on pricing."',
        usageStat: 'Price objection handled inconsistently · age objection unaddressed in 38% of calls',
        isMissingQuote: true,
      },
      {
        id: 'close',
        name: 'Close',
        score: 58,
        status: 'missing',
        quote: null,
        usageStat: '67% of no-close calls end without a direct booking ask',
        isMissingQuote: true,
      },
    ],
    suggestions: [
      {
        sectionName: 'Offer presentation',
        action: 'rewrite',
        originalQuote: '"We offer a 6-week program starting at $X per session."',
        suggestedQuote: '"Based on what you\'ve told me, [dog name] sounds like a great candidate for our program. Before I tell you about investment, can I ask — what would it mean for your family if this behavior was fixed in 6 weeks?"',
        rationale: 'Anchor value before price. Top closers who use this phrasing convert at 71% vs 38% on price-first approaches.',
      },
      {
        sectionName: 'Objection — price',
        action: 'rewrite',
        originalQuote: '"I understand, let me see what we can do on pricing."',
        suggestedQuote: '"I hear you — it is an investment. Can I ask, if money wasn\'t a factor, is this something you\'d want to move forward with? [pause] Then let\'s figure out how to make it work."',
        rationale: 'Isolates the objection before solving it. Calls using this pattern close at 68% vs 29%.',
      },
      {
        sectionName: 'Objection — age',
        action: 'add',
        originalQuote: null,
        suggestedQuote: '"Actually, older dogs can be some of our best students — they\'re less distracted and more focused. We\'ve had great results with dogs up to 12 years old. What breed is [dog name]?"',
        rationale: 'This objection comes up in 38% of calls and is currently unhandled. Adding this line estimated to recover 8–12 bookings/month.',
      },
      {
        sectionName: 'Close',
        action: 'add',
        originalQuote: null,
        suggestedQuote: '"Based on everything you\'ve shared, I think [dog name] would do really well with us. I have a spot opening [day] — would that work for you to come in and meet the team?"',
        rationale: '67% of lost calls have no direct booking ask. Adding an explicit close could be the single highest impact change in the entire script.',
      },
    ],
    topCloserPhrases: [
      {
        section: 'Discovery',
        uplift: '+18%',
        upliftType: 'close',
        quote: '"What has this behavior cost you — in stress, time, or relationships with your dog?"',
      },
      {
        section: 'Offer presentation',
        uplift: '+14%',
        upliftType: 'close',
        quote: '"Most of our clients see a significant change by week 3 — that\'s usually when the owner calls us to say they have a different dog."',
      },
      {
        section: 'Objection handling',
        uplift: '+22%',
        upliftType: 'close',
        quote: '"I totally understand. Let me ask — what\'s the cost of NOT fixing this over the next 12 months?"',
      },
      {
        section: 'Close',
        uplift: '+31%',
        upliftType: 'close',
        quote: '"I have [day] at [time] available — should I go ahead and reserve that for you and [dog name]?"',
      },
      {
        section: 'Opening',
        uplift: '+9%',
        upliftType: 'close',
        quote: '"Before I tell you about our programs, I\'d love to hear more about [dog name] — every dog is different and I want to make sure we\'re the right fit."',
      },
      {
        section: 'Follow-up',
        uplift: '+16%',
        upliftType: 'show',
        quote: '"I\'ll send you a quick text with the address and what to expect. Is [mobile number] the best for that?"',
      },
    ],
  }
}
