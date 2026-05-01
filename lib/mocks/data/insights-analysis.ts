import type { Call } from '@/lib/types'

/**
 * Generates the mock response for POST /api/insights (pattern analysis via LLM).
 * In Phase 2 this will be replaced by a real GPT-4o call.
 */
export function buildInsightsAnalysis(calls: Call[]) {
  const closedCalls = calls.filter((c) => c.result === 'closed')
  const notClosedCalls = calls.filter((c) => c.result === 'not_closed' || c.result === 'no_outcome')
  const partialCalls = calls.filter((c) => c.result === 'partial')

  return {
    metrics: {
      total: calls.length,
      closed: closedCalls.length,
      notClosed: notClosedCalls.length,
      partial: partialCalls.length,
      closeRate: Math.round((closedCalls.length / calls.length) * 100),
    },
    successPatterns: [
      'Ask at least 3 open-ended questions before presenting the offer',
      'Identify the real (emotional) pain before talking about price',
      'Use social proof with a breed and problem similar to the prospect\'s',
      'Create real urgency without artificial pressure',
      'Maintain strategic silence after presenting the price',
    ],
    failurePatterns: [
      'Jump straight to the offer presentation without discovery',
      'Respond to price objections defensively',
      'Offer a discount before exploring other options',
      'End the call without a defined next step',
      'Shallow discovery — fewer than 2 open-ended questions',
    ],
    partialPatterns: [
      'Good discovery but follow-up without a set date/time',
      'Fail to identify co-decision makers at the start of the call',
      'Lose control of the conversation in the objection phase',
    ],
    keyDifferences: [
      'Closers ask 3-4 open questions vs. 1-2 from non-closers',
      'Closers connect the problem to emotional and financial costs',
      'Closers never offer a discount as a first response to objections',
      'Closers define clear next steps in 100% of calls',
      'Non-closers go into "justification mode" when the price is questioned',
    ],
    dos: [
      'Ask at least 3 open-ended questions before any presentation',
      'Identify the real pain in under 5 minutes',
      'Connect the problem to emotional and financial impacts',
      'Use concrete ROI: "how much does it cost NOT to solve this?"',
      'Present the offer as the exact solution for the identified pain',
      'Maintain strategic silence after presenting the price',
      'Set the next step with a date and time',
      'Identify co-decision makers at the start of the call',
    ],
    donts: [
      'Don\'t skip discovery to go straight to the offer',
      'Don\'t offer a discount before exploring the objection',
      'Don\'t go defensive when the price is questioned',
      'Don\'t end the call without a clear commitment',
      'Don\'t use closed questions in discovery',
      'Don\'t present price before establishing value',
    ],
    commonObjections: [
      {
        objection: 'The investment is above what I had planned',
        frequency: 'Very Common',
        bestResponse: 'How much is it costing you NOT to fix this? The destroyed couch, the vet visits from stress, the restriction of traveling with your dog...',
        worstResponse: 'I understand, but our program has excellent value compared to...',
      },
      {
        objection: 'I need to talk to my husband/wife first',
        frequency: 'Common',
        bestResponse: 'That makes total sense. What if we include them on the next call? I can schedule Tuesday at 7pm.',
        worstResponse: 'Ok, I\'ll send you the material to show them.',
      },
      {
        objection: 'I\'ll think about it and get back to you',
        frequency: 'Very Common',
        bestResponse: 'Of course. What exactly do you need to think about? Maybe I can help with that question right now.',
        worstResponse: 'Of course, no problem. I\'ll be waiting to hear from you.',
      },
    ],
    preCallChecklist: [
      'Review the prospect\'s name and dog\'s name',
      'Prepare 3 open-ended discovery questions',
      'Have success cases ready by breed',
      'Mentally anchor the price before the call',
      'Prepare a response to the price objection without offering a discount',
      'Keep your calendar open to schedule a follow-up if needed',
      'Remember: silence after the price',
      'Goal: identify the pain in 5 minutes',
    ],
    suggestedScript: 'Optimized script based on the successful calls...',
    trainers: [
      { name: 'Marcus R.', email: 'marcusr@demo.askmoses.ai' },
      { name: 'Jamie L.', email: 'jamiel@demo.askmoses.ai' },
      { name: 'Jordan K.', email: 'jordank@demo.askmoses.ai' },
      { name: 'Taylor M.', email: 'taylorm@demo.askmoses.ai' },
    ],
  }
}
