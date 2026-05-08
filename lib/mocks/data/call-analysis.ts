import type { AnalyzeResult } from '@/app/api/analyze/route'

/**
 * Mock data for POST /api/analyze (individual call analysis).
 * In Phase 2 this will be replaced by a real GPT-4o call.
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

// Base scores vary by outcome
export const outcomeProfiles: Record<string, AnalysisProfile> = {
  closed: {
    scores: [5, 4, 5, 4, 5],
    overall: 4.6,
    detected: 'closed',
  },
  follow_up: {
    scores: [4, 4, 4, 3, 3],
    overall: 3.6,
    detected: 'partial',
  },
  objection_unresolved: {
    scores: [4, 3, 3, 2, 2],
    overall: 2.8,
    detected: 'not_closed',
  },
  no_decision: {
    scores: [3, 2, 3, 2, 1],
    overall: 2.2,
    detected: 'not_closed',
  },
}

function buildSectionFeedback(name: string, score: number): string {
  const feedbacks: Record<string, [string, string, string]> = {
    'Discovery': [
      'Excellent exploration with open-ended questions. Identified the real pain quickly.',
      'Reasonable discovery, but too few open questions before presenting the offer.',
      'Insufficient discovery — jumped straight to the presentation without exploring the pain.',
    ],
    'Problem Agitation': [
      'Connected the problem to emotional and financial impacts masterfully.',
      'Partial agitation — mentioned impacts but didn\'t go deep.',
      'Virtually no problem agitation. The prospect didn\'t feel urgency.',
    ],
    'Offer Presentation': [
      'Offer presented as the exact solution for the identified pain.',
      'Functional presentation but disconnected from the prospect\'s pain.',
      'Generic offer, with no connection to what was discussed in discovery.',
    ],
    'Objection Handling': [
      'Objections handled with effective reframing, without going defensive.',
      'Tried to get around objections but caved too quickly.',
      'Went defensive on the first objection. Offered a discount prematurely.',
    ],
    'Close & Next Steps': [
      'Confident close with clear next steps and a set date.',
      'Next steps defined but vague, no date/time.',
      'Call ended without a clear commitment. Prospect left with no next step.',
    ],
    'Objection Classification': [
      'Correctly identified the type of objection (price) and adjusted the approach.',
      'Classified the objection but was slow to react.',
      'Didn\'t identify the real objection — treated it as generic resistance.',
    ],
    'Reframing Technique': [
      'Successfully recontextualized the investment in terms of cost of inaction.',
      'Attempted reframing but went back to justifying the price.',
      'No reframing. Went straight into price justification mode.',
    ],
    'Social Proof': [
      'Used a specific case with a breed and problem similar to the prospect\'s.',
      'Mentioned success cases but without specificity.',
      'Used no social proof at any point in the call.',
    ],
  }

  const fb = feedbacks[name] || ['Good.', 'Reasonable.', 'Needs improvement.']
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
    summary: 'Excellent call with solid execution at every stage. The trainer guided the prospect from discovery to close naturally and without pressure.',
    strengths: [
      'Deep discovery with 4+ open-ended questions before the offer',
      'Created real urgency by connecting the problem to emotional costs',
      'Natural close with clear next steps and a set date',
    ],
    improvements: [
      'Could have included more social proof during the presentation',
    ],
  },
  follow_up: {
    summary: 'Well-conducted call with good rapport, but didn\'t close. Follow-up was correctly scheduled. There\'s likely a co-decision maker involved.',
    strengths: [
      'Discovery correctly identified the real pain',
      'Maintained prospect engagement throughout the call',
      'Follow-up scheduled with a specific date and time',
    ],
    improvements: [
      'Identify co-decision makers earlier in discovery',
      'Deepen problem agitation to create more urgency',
    ],
  },
  objection_unresolved: {
    summary: 'Call with a promising start that stalled in the objection phase. The trainer couldn\'t reframe the investment and went into defensive mode.',
    strengths: [
      'Good call opening with strong initial rapport',
      'Knows the product well and presented it clearly',
    ],
    improvements: [
      'Never justify the price — reframe with cost of inaction',
      'Stop offering discounts as a first response',
      'Practice price objection role-play with a focus on value',
    ],
  },
  no_decision: {
    summary: 'Weak call with no clear direction. The prospect led the conversation and the trainer couldn\'t create enough value to move forward. Urgent coaching needed.',
    strengths: [
      'Managed to keep the prospect on the call',
    ],
    improvements: [
      'Very shallow discovery — needed more open-ended questions',
      'No problem agitation — the prospect didn\'t feel urgency',
      'Call ended with no next step or commitment',
      'Train conversation control and closing techniques',
    ],
  },
}

export const mockGeneratedScript = {
  name: 'Generated Script - Dog Training Sales',
  description: 'Optimized script based on the provided transcripts.',
  sections: [
    { name: 'Opening & Rapport', instructions: 'Greet and ask what prompted the contact.', tips: 'Be genuine.' },
    { name: 'Deep Discovery', instructions: 'Ask 3+ open-ended questions before any presentation.', tips: 'Identify the real pain.' },
    { name: 'Problem Agitation', instructions: 'Connect the problem to emotional and financial costs.', tips: '"And how does that affect..."' },
    { name: 'Offer Presentation', instructions: 'Present as the exact solution for the pain.', tips: 'Value before price.' },
    { name: 'Objection Handling', instructions: 'Reframe the investment in terms of cost of inaction.', tips: '"How much does it cost NOT to solve this?"' },
    { name: 'Close', instructions: 'Propose a clear next step.', tips: 'Strategic silence after the price.' },
  ],
  full_script: 'Complete script generated by AI...',
  criteria: [
    { name: 'Rapport Building', description: 'Establishes connection in first 2 minutes' },
    { name: 'Open Questions', description: 'At least 3 open questions before presenting' },
    { name: 'Pain Identification', description: 'Identifies real pain, not symptom' },
    { name: 'Value Before Price', description: 'Establishes value before pricing' },
    { name: 'Clear Next Steps', description: 'Call ends with clear commitment' },
  ],
  explanation: 'Script generated based on the best practices identified in the provided transcripts.',
}

export function buildMockAnalysis(): AnalyzeResult {
  const criteriaScores = [
    { criterionId: 'discovery', criterionName: 'Discovery', score: 4.1, justification: 'Good open-ended questions, identified the main pain point.' },
    { criterionId: 'problem-agitation', criterionName: 'Problem Agitation', score: 3.6, justification: 'Mentioned impacts but did not go deep enough.' },
    { criterionId: 'offer-presentation', criterionName: 'Offer Presentation', score: 4.0, justification: 'Clear presentation but loosely connected to the identified pain.' },
    { criterionId: 'objection-handling', criterionName: 'Objection Handling', score: 3.8, justification: 'Handled the price objection but conceded too quickly.' },
    { criterionId: 'close', criterionName: 'Close & Next Steps', score: 4.0, justification: 'Next steps defined with a date, but without urgency.' },
  ]
  const sections = [
    { name: 'Discovery', score: 4.1, feedback: 'Good open-ended questions, identified the main pain point.', critical: true, weight: 20 },
    { name: 'Problem Agitation', score: 3.6, feedback: 'Mentioned impacts but did not go deep enough.', critical: true, weight: 20 },
    { name: 'Offer Presentation', score: 4.0, feedback: 'Clear presentation but loosely connected to the identified pain.', critical: false, weight: 20 },
    { name: 'Objection Handling', score: 3.8, feedback: 'Handled the price objection but conceded too quickly.', critical: false, weight: 20 },
    { name: 'Close & Next Steps', score: 4.0, feedback: 'Next steps defined with a date, but without urgency.', critical: false, weight: 20 },
  ]
  return {
    overallScore: 3.9,
    detectedOutcome: 'partial',
    summary: 'Well-conducted call with good rapport, but no close. Follow-up was correctly scheduled. The trainer showed solid product knowledge but needs to deepen problem agitation.',
    strengths: [
      'Discovery correctly identified the real pain of the prospect',
      'Maintained prospect engagement throughout the call',
      'Follow-up scheduled with a specific date and time',
    ],
    improvements: [
      'Identify co-decision makers earlier in discovery',
      'Deepen problem agitation to create more urgency',
      'Practice direct closing techniques',
    ],
    criteriaScores,
    sections,
    transcript: '',
    cost: { modelUsed: 'gpt-4o-mini', inputTokens: 0, outputTokens: 0, costUsd: 0, promptVersion: 'mock' },
  }
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
