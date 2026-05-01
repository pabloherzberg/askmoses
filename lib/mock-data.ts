import type {
  Trainer,
  Call,
  CallSection,
  RubricSection,
  Insight,
  Client,
  Plan,
  TrendPoint,
  GlobalMetrics,
  Role,
  RevenueEstimatorItem,
  PerformanceTrendPoint,
} from '@/lib/types'

// ─── Trainers ────────────────────────────────────────────────────────────────

export const trainers: Trainer[] = [
  {
    id: '00000000-0000-0000-0000-000000000301',
    name: 'Marcus R.',
    avatar: 'MR',
    avatarColor: 'amber',
    role: 'trainer',
    totalCalls: 47,
    callsThisWeek: 6,
    closeRate: 68,
    closeDelta: 5,
    score: 91,
    scoreDelta: 11,
    lastActive: '4/10/2026',
    ownerId: '00000000-0000-0000-0000-000000000100',
    rubricScores: {
      discovery: 94,
      problemAgitation: 89,
      offerPresentation: 95,
      objectionHandling: 81,
      closeAndNextSteps: 90,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000302',
    name: 'Jamie L.',
    avatar: 'JL',
    avatarColor: 'purple',
    role: 'trainer',
    totalCalls: 22,
    callsThisWeek: 4,
    closeRate: 68,
    closeDelta: 4,
    score: 87,
    scoreDelta: 7,
    lastActive: 'Yesterday',
    ownerId: '00000000-0000-0000-0000-000000000100',
    rubricScores: {
      discovery: 88,
      problemAgitation: 88,
      offerPresentation: 84,
      objectionHandling: 81,
      closeAndNextSteps: 82,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000303',
    name: 'Jordan K.',
    avatar: 'JK',
    avatarColor: 'green',
    role: 'trainer',
    totalCalls: 19,
    callsThisWeek: 3,
    closeRate: 61,
    closeDelta: 1,
    score: 79,
    scoreDelta: 3,
    lastActive: 'Active today',
    ownerId: '00000000-0000-0000-0000-000000000100',
    rubricScores: {
      discovery: 79,
      problemAgitation: 61,
      offerPresentation: 80,
      objectionHandling: 65,
      closeAndNextSteps: 65,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000304',
    name: 'Taylor M.',
    avatar: 'TM',
    avatarColor: 'red',
    role: 'trainer',
    totalCalls: 14,
    callsThisWeek: 2,
    closeRate: 55,
    closeDelta: -2,
    score: 74,
    scoreDelta: -12,
    lastActive: '3 days ago',
    ownerId: '00000000-0000-0000-0000-000000000100',
    rubricScores: {
      discovery: 67,
      problemAgitation: 58,
      offerPresentation: 70,
      objectionHandling: 55,
      closeAndNextSteps: 63,
    },
  },
]

// ─── Calls ───────────────────────────────────────────────────────────────────

export const calls: Call[] = [
  // Marcus R. — 7 calls, mostly closed
  {
    id: '00000000-0000-0000-0000-000000000601',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-22',
    duration: '38min',
    score: 94,
    result: 'closed',
    prospect: 'Bob W.',
    rubricScores: { discovery: 96, problemAgitation: 91, offerPresentation: 97, objectionHandling: 84, closeAndNextSteps: 92 },
    sections: [
      { name: 'Discovery',           score: 4.8, feedback: 'Asked 4 open-ended questions before any presentation. Identified the escape problem and emotional stakes within 5 minutes.', critical: true },
      { name: 'Problem Agitation',   score: 4.5, feedback: 'Reflected the family tension back to Bob, deepening urgency. Connected the problem to real cost (lost dog, restricted life).', critical: true },
      { name: 'Offer Presentation',  score: 4.8, feedback: 'Offer framed as the exact solution to Bob\'s stated pain. Transformation described before price.', critical: false },
      { name: 'Objection Handling',  score: 4.2, feedback: 'Price objection handled with a concrete ROI reframe. Could have been slightly quicker.', critical: false },
      { name: 'Close & Next Steps',  score: 4.6, feedback: 'Natural close without pressure. Next step was clear and concrete.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Excellent performance. Marcus demonstrated complete mastery of the discovery process, asking 4 open-ended questions before any presentation. The close was natural and pressure-free.',
    strengths: [
      'Asked 4 open-ended questions before presenting any offer',
      'Identified the main pain point (Rex escaping the yard) in under 5 minutes',
      'Handled price objection using concrete ROI: "how much does a lost dog cost?"',
    ],
    improvements: [
      'Could have deepened problem agitation more before moving to the offer',
    ],
    transcript: 'Marcus: Hi Bob, thanks for making time today. Before anything else, tell me — what\'s going on with Rex that brought you to us?\nBob: Man, he just doesn\'t listen to anything. We can barely leave the house with him.\nMarcus: I get it. When you say he doesn\'t listen — give me a concrete example from recently.\nBob: Last week he escaped the yard for the third time. We spent two hours looking for him in the neighborhood.\nMarcus: Wow, that must\'ve been terrifying. Does this affect your daily life beyond the safety concern?\nBob: Absolutely. My daughter is scared to play with him now, and my wife said if it doesn\'t get fixed, we\'ll have to rehome him.\nMarcus: I understand the gravity of that. Before I show you what we do — have you tried anything before? Group classes, YouTube, another trainer?\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000602',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-20',
    duration: '42min',
    score: 91,
    result: 'closed',
    prospect: 'Sarah K.',
    rubricScores: { discovery: 95, problemAgitation: 88, offerPresentation: 94, objectionHandling: 80, closeAndNextSteps: 90 },
    sections: [
      { name: 'Discovery',           score: 4.8, feedback: 'Discovered the root cause (separation anxiety) in 3 questions. Solid use of follow-up questions to validate.', critical: true },
      { name: 'Problem Agitation',   score: 4.4, feedback: 'Connected the behavior to financial damage (furniture). Could have added more emotional depth.', critical: true },
      { name: 'Offer Presentation',  score: 4.7, feedback: 'Offer presented as the specific fix for identified pain. Price held without discount.', critical: false },
      { name: 'Objection Handling',  score: 4.0, feedback: 'Redirected to value effectively. Could improve speed of initial response.', critical: false },
      { name: 'Close & Next Steps',  score: 4.5, feedback: 'Closed at full price. Concrete next step defined.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Great call. Marcus used the open-ended questioning method masterfully. The objection moment was handled well by redirecting focus to the value of the transformation.',
    strengths: [
      'Discovered in 3 questions that the dog was destroying furniture due to separation anxiety',
      'Presented the offer as the exact solution for the identified pain',
      'Closed without a discount, holding full price',
    ],
    improvements: [
      'Problem agitation could have been more specific with numbers and costs',
    ],
    transcript: 'Marcus: Sarah, tell me a bit about Thor. What motivated you to reach out today?\nSarah: He\'s destroying everything at home when we leave. Sofa, baseboards, he was even scratching the door...\nMarcus: How long has this been going on?\nSarah: Since we went back to working in-office, about 4 months or so.\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000603',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-18',
    duration: '35min',
    score: 89,
    result: 'closed',
    prospect: 'Mike D.',
    rubricScores: { discovery: 93, problemAgitation: 87, offerPresentation: 92, objectionHandling: 80, closeAndNextSteps: 88 },
    sections: [
      { name: 'Discovery',           score: 4.6, feedback: 'Uncovered the social embarrassment angle — a pain point the prospect hadn\'t explicitly stated.', critical: true },
      { name: 'Problem Agitation',   score: 4.3, feedback: 'Used social proof to anchor the agitation. Time in the agitation phase was slightly short.', critical: true },
      { name: 'Offer Presentation',  score: 4.6, feedback: 'Specific social proof example matched the prospect\'s breed. Clear transformation framing.', critical: false },
      { name: 'Objection Handling',  score: 4.0, feedback: 'Minor hesitation on the time objection before recovering. Good final resolution.', critical: false },
      { name: 'Close & Next Steps',  score: 4.4, feedback: 'Clean close. Next steps confirmed before ending the call.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Solid call. Discovery well executed, offer presented at the right time. Minor hesitation on the time objection, but handled well.',
    strengths: [
      'Discovered the real issue was embarrassment on the street, not just behavior at home',
      'Used specific social proof: "we had a Golden with the same problem..."',
    ],
    improvements: [
      'Could have spent more time in the agitation phase before presenting the solution',
    ],
    transcript: 'Marcus: Mike, what\'s going on with Bolt?\nMike: He pulls the leash like crazy. I walk crooked from holding him so tight. I\'m embarrassed to take him to the park...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000604',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-15',
    duration: '45min',
    score: 88,
    result: 'closed',
    prospect: 'Linda P.',
    rubricScores: { discovery: 92, problemAgitation: 86, offerPresentation: 91, objectionHandling: 79, closeAndNextSteps: 88 },
    sections: [
      { name: 'Discovery',           score: 4.6, feedback: 'Kept prospect engaged with strategic questions across a longer call. Strong active listening.', critical: true },
      { name: 'Problem Agitation',   score: 4.3, feedback: 'Urgency created naturally via limited spots. Emotional connection was present.', critical: true },
      { name: 'Offer Presentation',  score: 4.5, feedback: 'Offer well-positioned after the agitation. Price context was strong.', critical: false },
      { name: 'Objection Handling',  score: 4.0, feedback: 'Some resistance required extra effort to navigate. Final resolution was effective.', critical: false },
      { name: 'Close & Next Steps',  score: 4.4, feedback: 'Closed successfully. Next step lacked a specific time — ended somewhat open.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Good performance. Longer call than usual, but Marcus maintained control of the conversation throughout.',
    strengths: [
      'Kept the prospect engaged for 45 minutes with strategic questions',
      'Created real urgency by mentioning limited spots in the in-person program',
    ],
    improvements: ['Next steps could have been more specific — ended without a set date'],
    transcript: 'Marcus: Linda, how old is Bella now?\nLinda: Almost 8 months. And she\'s already too big for us to hold when she gets hyper...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000605',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-12',
    duration: '30min',
    score: 86,
    result: 'closed',
    prospect: 'Tom R.',
    rubricScores: { discovery: 91, problemAgitation: 84, offerPresentation: 89, objectionHandling: 78, closeAndNextSteps: 86 },
    sections: [
      { name: 'Discovery',           score: 4.5, feedback: 'Correctly read that the prospect was pre-qualified and calibrated the depth accordingly.', critical: true },
      { name: 'Problem Agitation',   score: 4.2, feedback: 'Lighter agitation appropriate for a warm prospect. Slightly short for a cold lead.', critical: true },
      { name: 'Offer Presentation',  score: 4.4, feedback: 'Plans presented in ascending value order. Prospect engaged quickly.', critical: false },
      { name: 'Objection Handling',  score: 3.9, feedback: 'No major objections arose. Baseline handling readiness was demonstrated.', critical: false },
      { name: 'Close & Next Steps',  score: 4.3, feedback: 'Efficient close. Could have been even cleaner with a harder ask.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Efficient and quick call. Marcus correctly identified that Tom was ready to buy from the start and adjusted the pace accordingly.',
    strengths: [
      'Correctly read that the prospect was qualified and accelerated the call',
      'Presented the plans in ascending order of value',
    ],
    improvements: ['Discovery was a bit short — could have extracted more information'],
    transcript: 'Marcus: Tom, first of all — do you already know our method or are you coming in fresh?\nTom: I\'ve done a lot of research. Saw the testimonials on Instagram. Just want to know how it works in practice.\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000606',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-09',
    duration: '28min',
    score: 85,
    result: 'partial',
    prospect: 'Amy C.',
    rubricScores: { discovery: 93, problemAgitation: 88, offerPresentation: 90, objectionHandling: 76, closeAndNextSteps: 83 },
    sections: [
      { name: 'Discovery',           score: 4.6, feedback: 'Identified the co-decision maker before attempting a close. Strong situational awareness.', critical: true },
      { name: 'Problem Agitation',   score: 4.4, feedback: 'Future pacing used well. Prospect was emotionally engaged throughout.', critical: true },
      { name: 'Offer Presentation',  score: 4.5, feedback: 'Offer positioned against the emotional stakes. Value clearly communicated.', critical: false },
      { name: 'Objection Handling',  score: 3.8, feedback: 'Handled the husband situation gracefully but missed the opportunity to include him live.', critical: false },
      { name: 'Close & Next Steps',  score: 4.1, feedback: 'Follow-up booked with a specific date. Good discipline in not leaving it open-ended.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Excellent discovery and presentation. The call didn\'t close because Amy needed to confirm schedule availability with her husband — follow-up booked for 2 days out.',
    strengths: [
      'Identified the co-decision maker (husband) before attempting to close',
      'Left the follow-up with a specific date and time, not open-ended',
    ],
    improvements: ['Could have suggested including the husband on the call instead of rescheduling'],
    transcript: 'Marcus: Amy, tell me — when you picture Duke fully trained, how do you see your day-to-day looking different?\nAmy: It would be amazing. We could take him anywhere without stress...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000607',
    trainerId: '00000000-0000-0000-0000-000000000301',
    trainerName: 'Marcus R.',
    date: '2026-03-06',
    duration: '40min',
    score: 82,
    result: 'closed',
    prospect: 'Chris B.',
    rubricScores: { discovery: 90, problemAgitation: 85, offerPresentation: 88, objectionHandling: 72, closeAndNextSteps: 82 },
    sections: [
      { name: 'Discovery',           score: 4.5, feedback: 'Established cost-of-inaction framing early. Used the "what is this costing you?" question effectively.', critical: true },
      { name: 'Problem Agitation',   score: 4.2, feedback: 'Multiple cost dimensions surfaced (furniture, vet, travel). Solid emotional connection.', critical: true },
      { name: 'Offer Presentation',  score: 4.4, feedback: 'Presentation was clear. Slight delay in recovering after the price objection.', critical: false },
      { name: 'Objection Handling',  score: 3.6, feedback: 'Price objection response was a bit defensive. Used strategic silence but could have reframed more quickly.', critical: false },
      { name: 'Close & Next Steps',  score: 4.1, feedback: 'Closed despite stronger-than-usual resistance. Tone stayed calm throughout.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Good call with consistent close. The price objection came in stronger than usual and Marcus took a moment to regain control.',
    strengths: [
      'Kept a calm tone during the more resistant price objection',
      'Used the strategic silence technique after presenting the price',
    ],
    improvements: ['The response to the price objection could have been quicker and less defensive'],
    transcript: 'Marcus: Chris, in the current situation without training — how much do you think Max\'s behavior is actually "costing" you?\nChris: Never thought about it that way...\nMarcus: The couch he destroyed, the vet visits from stress, the restriction of traveling with him...\n...',
  },

  // Jamie L. — 5 calls
  {
    id: '00000000-0000-0000-0000-000000000608',
    trainerId: '00000000-0000-0000-0000-000000000302',
    trainerName: 'Jamie L.',
    date: '2026-03-21',
    duration: '35min',
    score: 90,
    result: 'closed',
    prospect: 'Diana M.',
    rubricScores: { discovery: 91, problemAgitation: 90, offerPresentation: 88, objectionHandling: 84, closeAndNextSteps: 87 },
    sections: [
      { name: 'Discovery',           score: 4.5, feedback: 'Good situational questions. Identified that the dog was restricting the prospect\'s social life.', critical: true },
      { name: 'Problem Agitation',   score: 4.5, feedback: 'Empathetic delivery made agitation feel genuine. Prospect became emotionally engaged without feeling manipulated.', critical: true },
      { name: 'Offer Presentation',  score: 4.4, feedback: 'Offer framed as a lifestyle restoration, not just a training service. Strong value communication.', critical: false },
      { name: 'Objection Handling',  score: 4.2, feedback: 'Close made before resistance surfaced — good timing read.', critical: false },
      { name: 'Close & Next Steps',  score: 4.3, feedback: 'Closed with confidence. Concrete follow-up step defined.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Excellent call from Jamie. The problem agitation was particularly strong — Diana became visibly emotional talking about how much stress the dog was causing.',
    strengths: [
      'Problem agitation delivered with genuine empathy — didn\'t come across as manipulative',
      'Close made before resistance surfaced',
    ],
    improvements: ['Discovery could have explored more about prior attempts'],
    transcript: 'Jamie: Diana, what happens at your house when you need to have guests over?\nDiana: It\'s chaos. Toby barks and jumps on everyone. I even stopped having my mom over because of it...\nJamie: How long has this been going on?\nDiana: Over a year. I\'m exhausted...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000609',
    trainerId: '00000000-0000-0000-0000-000000000302',
    trainerName: 'Jamie L.',
    date: '2026-03-19',
    duration: '32min',
    score: 85,
    result: 'closed',
    prospect: 'Robert L.',
    rubricScores: { discovery: 88, problemAgitation: 86, offerPresentation: 84, objectionHandling: 80, closeAndNextSteps: 82 },
    sections: [
      { name: 'Discovery',           score: 4.4, feedback: 'Specific situational question surfaced a concrete recent example. Good depth.', critical: true },
      { name: 'Problem Agitation',   score: 4.3, feedback: 'Calibrated agitation for a prospect already aware of the problem. Appropriately restrained.', critical: true },
      { name: 'Offer Presentation',  score: 4.2, feedback: 'Breed-specific social proof was a strong touch. Offer felt personalized.', critical: false },
      { name: 'Objection Handling',  score: 4.0, feedback: 'No major objections. Handled minor hesitation smoothly.', critical: false },
      { name: 'Close & Next Steps',  score: 4.1, feedback: 'Close felt slightly hesitant. Could have been more directive.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Well-conducted and efficient call. Robert was already aware of the problem and Jamie correctly calibrated the intensity of the agitation.',
    strengths: [
      'Correctly calibrated agitation level for a prospect already aware of the problem',
      'Presented cases of a similar breed (Border Collie)',
    ],
    improvements: ['The close could have been more directive — felt slightly hesitant'],
    transcript: 'Jamie: Robert, when you say Luna "doesn\'t focus" — describe a specific situation from last week.\nRobert: Just yesterday. I tried teaching "sit" for half an hour. She knows how to do it, but ignores me when she wants...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000610',
    trainerId: '00000000-0000-0000-0000-000000000302',
    trainerName: 'Jamie L.',
    date: '2026-03-16',
    duration: '38min',
    score: 82,
    result: 'partial',
    prospect: 'Karen H.',
    rubricScores: { discovery: 87, problemAgitation: 85, offerPresentation: 82, objectionHandling: 78, closeAndNextSteps: 80 },
    sections: [
      { name: 'Discovery',           score: 4.3, feedback: 'Found the co-decision maker mid-call. Would have been stronger if surfaced in opening questions.', critical: true },
      { name: 'Problem Agitation',   score: 4.2, feedback: 'Connected the dog scratching to child safety — high emotional stakes leveraged well.', critical: true },
      { name: 'Offer Presentation',  score: 4.1, feedback: 'Offer presentation was solid. Slightly cut short given the co-decision constraint.', critical: false },
      { name: 'Objection Handling',  score: 3.9, feedback: 'Didn\'t push for a close knowing a second decision-maker was needed. Appropriate restraint.', critical: false },
      { name: 'Close & Next Steps',  score: 4.0, feedback: 'Follow-up scheduled. Maintained Karen\'s engagement for the next call.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Good call. Karen is a shared decision-maker with her husband and Jamie identified this halfway through — follow-up to include him.',
    strengths: [
      'Didn\'t try to close knowing there was another decision-maker in the equation',
      'Maintained Karen\'s engagement for the next call',
    ],
    improvements: ['The co-decision maker question could have been identified earlier in discovery'],
    transcript: 'Jamie: Karen, what made you decide to look for a professional trainer now?\nKaren: My husband was reluctant, but after Buddy scratched the child, we agreed we needed help...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000611',
    trainerId: '00000000-0000-0000-0000-000000000302',
    trainerName: 'Jamie L.',
    date: '2026-03-13',
    duration: '25min',
    score: 79,
    result: 'closed',
    prospect: 'Steve N.',
    rubricScores: { discovery: 84, problemAgitation: 82, offerPresentation: 80, objectionHandling: 74, closeAndNextSteps: 78 },
    sections: [
      { name: 'Discovery',           score: 4.2, feedback: 'Used a future-pacing question to open. Solid but brief.', critical: true },
      { name: 'Problem Agitation',   score: 4.1, feedback: 'Agitation moved too fast. Emotional cost of the problem was not fully developed.', critical: true },
      { name: 'Offer Presentation',  score: 4.0, feedback: 'Direct no-nonsense presentation matched the prospect\'s profile. Left upsell potential untouched.', critical: false },
      { name: 'Objection Handling',  score: 3.7, feedback: 'Minor handling of slight hesitation. Could have probed deeper.', critical: false },
      { name: 'Close & Next Steps',  score: 3.9, feedback: 'Consistent close in a short call. Could have pushed for a higher-tier plan.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Shorter call than ideal. Jamie closed but left money on the table — Steve could have bought a more complete plan with more agitation.',
    strengths: ['Consistent close even in a shorter call', 'Direct and no-nonsense tone, appropriate for the prospect\'s profile'],
    improvements: ['Problem agitation too fast — didn\'t explore the emotional costs of the problem'],
    transcript: 'Jamie: Steve, quick question — what would change in your routine if Rocky was fully obedient in the first 3 months?\nSteve: Mainly the runs. He has potential but doesn\'t focus...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000612',
    trainerId: '00000000-0000-0000-0000-000000000302',
    trainerName: 'Jamie L.',
    date: '2026-03-10',
    duration: '42min',
    score: 75,
    result: 'no_outcome',
    prospect: 'Nancy W.',
    rubricScores: { discovery: 85, problemAgitation: 80, offerPresentation: 78, objectionHandling: 62, closeAndNextSteps: 70 },
    sections: [
      { name: 'Discovery',           score: 4.2, feedback: 'Good rapport. Real pain correctly identified. Opening was strong.', critical: true },
      { name: 'Problem Agitation',   score: 4.0, feedback: 'Pain was established but emotional intensity faded before the close attempt.', critical: true },
      { name: 'Offer Presentation',  score: 3.9, feedback: 'Offer presentation was adequate but not compelling enough to neutralize the price concern.', critical: false },
      { name: 'Objection Handling',  score: 3.1, feedback: 'Went into justification mode immediately. Failed to probe the real objection or reframe value. Call ended with no commitment.', critical: false },
      { name: 'Close & Next Steps',  score: 3.5, feedback: 'No next step defined. Call ended open-ended — prospect left without any commitment.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Discovery and agitation well done, but Jamie couldn\'t overcome the price objection effectively. Nancy left without buying and without a clear next step.',
    strengths: ['Good rapport built in the opening phase', 'Discovery correctly identified the real pain'],
    improvements: [
      'Response to price objection was defensive — went into justification mode instead of reframing',
      'No next step defined — call ended without commitment',
    ],
    transcript: 'Nancy: The investment is above what I had planned to spend...\nJamie: I understand, but our program has excellent value for money compared to...\nNancy: Sure, but I don\'t have that amount available right now...\n...',
  },

  // Jordan K. — 5 calls
  {
    id: '00000000-0000-0000-0000-000000000613',
    trainerId: '00000000-0000-0000-0000-000000000303',
    trainerName: 'Jordan K.',
    date: '2026-03-22',
    duration: '28min',
    score: 81,
    result: 'partial',
    prospect: 'Peter G.',
    rubricScores: { discovery: 82, problemAgitation: 65, offerPresentation: 83, objectionHandling: 70, closeAndNextSteps: 68 },
    sections: [
      { name: 'Discovery',           score: 4.1, feedback: 'Problem identified early. Questions were surface-level — no follow-up depth.', critical: true },
      { name: 'Problem Agitation',   score: 3.2, feedback: 'Jumped from discovery directly to the offer. The prospect\'s pain was not sufficiently deepened.', critical: true },
      { name: 'Offer Presentation',  score: 4.1, feedback: 'Clear and well-structured program explanation. Confident delivery.', critical: false },
      { name: 'Objection Handling',  score: 3.5, feedback: 'Some hesitation managed. Could have been more proactive in surfacing concerns.', critical: false },
      { name: 'Close & Next Steps',  score: 3.4, feedback: 'Follow-up vague — "I\'ll send you the material" with no date. Low commitment signal.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Reasonable discovery. Jordan identified the problem but moved too quickly to the offer presentation. Problem agitation was superficial.',
    strengths: ['Offer presentation clear and well-structured', 'Confident tone throughout the call'],
    improvements: [
      'Jumped from discovery directly to the offer without adequately agitating the problem',
      'Follow-up was vague — "I\'ll send you the material" with no date',
    ],
    transcript: 'Jordan: Peter, tell me what\'s going on with Gobi.\nPeter: He\'s super hyper. Jumps on everyone, can\'t stay still.\nJordan: Got it. So what we offer is an 8-week program...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000614',
    trainerId: '00000000-0000-0000-0000-000000000303',
    trainerName: 'Jordan K.',
    date: '2026-03-19',
    duration: '35min',
    score: 75,
    result: 'closed',
    prospect: 'Donna F.',
    rubricScores: { discovery: 80, problemAgitation: 62, offerPresentation: 81, objectionHandling: 66, closeAndNextSteps: 65 },
    sections: [
      { name: 'Discovery',           score: 4.0, feedback: 'Functional discovery. Problems identified but not probed deeply.', critical: true },
      { name: 'Problem Agitation',   score: 3.1, feedback: 'Weak agitation — Donna wasn\'t sufficiently committed to value before price was discussed.', critical: true },
      { name: 'Offer Presentation',  score: 4.0, feedback: 'Product knowledge evident. Presentation was clear but not emotionally anchored.', critical: false },
      { name: 'Objection Handling',  score: 3.3, feedback: 'Gave a discount without exploring other resolution paths. Price objection not genuinely handled.', critical: false },
      { name: 'Close & Next Steps',  score: 3.2, feedback: 'Closed with a discount — value was not sufficiently established. Leaves precedent for future negotiations.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Closed but with an unnecessary discount. Jordan didn\'t create enough value in the agitation phase and caved on price before exploring other objections.',
    strengths: ['Persisted through to close despite objection', 'Knows the product well and presented it clearly'],
    improvements: [
      'Gave a discount without trying to resolve the objection in other ways',
      'Problem agitation too weak — Donna wasn\'t sufficiently committed',
    ],
    transcript: 'Jordan: Donna, I\'ll be straight — if you sign up today, I can apply a 10% discount...\nDonna: Oh, that works better for me...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000615',
    trainerId: '00000000-0000-0000-0000-000000000303',
    trainerName: 'Jordan K.',
    date: '2026-03-16',
    duration: '30min',
    score: 73,
    result: 'no_outcome',
    prospect: 'Mark T.',
    rubricScores: { discovery: 78, problemAgitation: 60, offerPresentation: 79, objectionHandling: 63, closeAndNextSteps: 62 },
    sections: [
      { name: 'Discovery',           score: 3.9, feedback: 'Good opening atmosphere. Only surface-level questions before pivoting to the pitch.', critical: true },
      { name: 'Problem Agitation',   score: 3.0, feedback: 'Offer presented at minute 10 — problem was barely established. Prospect disengaged shortly after.', critical: true },
      { name: 'Offer Presentation',  score: 3.9, feedback: 'Presentation was structured but lost impact because the problem frame wasn\'t set.', critical: false },
      { name: 'Objection Handling',  score: 3.1, feedback: 'Didn\'t attempt recovery when disengagement was visible. Opportunity missed.', critical: false },
      { name: 'Close & Next Steps',  score: 3.1, feedback: 'No real close attempt. Call ended without a commitment or a defined next step.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Call with a good start but lost the thread halfway. Jordan moved to the offer too early and couldn\'t regain the prospect\'s engagement.',
    strengths: ['Good call opening, created a positive initial atmosphere'],
    improvements: [
      'Presented the offer at minute 10 — too early, before the problem was well established',
      'Didn\'t try to recover when sensing the prospect was disengaged',
    ],
    transcript: 'Jordan: Mark, great to meet you. So you\'re interested in training for Rocky, right?\nMark: Yeah, saw it on Google...\nJordan: Great! Let me tell you about our program...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000616',
    trainerId: '00000000-0000-0000-0000-000000000303',
    trainerName: 'Jordan K.',
    date: '2026-03-13',
    duration: '25min',
    score: 70,
    result: 'partial',
    prospect: 'Susan B.',
    rubricScores: { discovery: 76, problemAgitation: 58, offerPresentation: 78, objectionHandling: 62, closeAndNextSteps: 60 },
    sections: [
      { name: 'Discovery',           score: 3.8, feedback: 'Only 2 questions before moving to the offer. Prospect\'s situation barely explored.', critical: true },
      { name: 'Problem Agitation',   score: 2.9, feedback: 'Practically non-existent. Jumped from a vague problem description directly to "want me to send info?"', critical: true },
      { name: 'Offer Presentation',  score: 3.9, feedback: 'Product knowledge is solid. Delivery lacks urgency or emotional hook.', critical: false },
      { name: 'Objection Handling',  score: 3.1, feedback: 'No real objections surfaced — likely because the conversation never went deep enough.', critical: false },
      { name: 'Close & Next Steps',  score: 3.0, feedback: 'Follow-up scheduled but without qualifying interest. Low commitment from prospect.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Weak call. Jordan managed to present the product but without creating the urgency context needed for the close.',
    strengths: ['Solid product knowledge'],
    improvements: [
      'Very shallow discovery — only 2 questions before moving to the offer',
      'Problem agitation practically non-existent',
      'Follow-up scheduled but with no real qualification of interest',
    ],
    transcript: 'Jordan: Susan, what\'s Coco\'s issue?\nSusan: Oh, he\'s kind of hyper...\nJordan: Got it. Want me to send you more info about the program?\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000617',
    trainerId: '00000000-0000-0000-0000-000000000303',
    trainerName: 'Jordan K.',
    date: '2026-03-10',
    duration: '20min',
    score: 65,
    result: 'no_outcome',
    prospect: 'James R.',
    rubricScores: { discovery: 68, problemAgitation: 55, offerPresentation: 72, objectionHandling: 60, closeAndNextSteps: 58 },
    sections: [
      { name: 'Discovery',           score: 3.4, feedback: 'Single question about the dog before pivoting to price. No situational context built.', critical: true },
      { name: 'Problem Agitation',   score: 2.7, feedback: 'No agitation attempt. Went from problem mention to price quote in under 2 minutes.', critical: true },
      { name: 'Offer Presentation',  score: 3.6, feedback: 'Price and program mentioned clearly. Zero framing or value setup before the number.', critical: false },
      { name: 'Objection Handling',  score: 3.0, feedback: 'Prospect said "let me think" and Jordan accepted without any probe or push.', critical: false },
      { name: 'Close & Next Steps',  score: 2.9, feedback: 'Premature close with no foundation. Ended without a defined next step.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Very short and shallow call. Jordan couldn\'t deepen the conversation enough to create value.',
    strengths: ['At least the call happened — Jordan needed more discovery practice'],
    improvements: [
      'Call ended too early — James needed more time to build trust',
      'No real attempt at problem agitation',
      'Premature close without a value foundation',
    ],
    transcript: 'Jordan: James, tell me about Brutus.\nJames: He\'s just too big for us to control...\nJordan: Got it. Our program fixes that. The investment is X...\nJames: Hmm, let me think...\n...',
  },

  // Taylor M. — 4 calls
  {
    id: '00000000-0000-0000-0000-000000000618',
    trainerId: '00000000-0000-0000-0000-000000000304',
    trainerName: 'Taylor M.',
    date: '2026-03-20',
    duration: '22min',
    score: 74,
    result: 'no_outcome',
    prospect: 'Helen K.',
    rubricScores: { discovery: 70, problemAgitation: 60, offerPresentation: 74, objectionHandling: 58, closeAndNextSteps: 65 },
    sections: [
      { name: 'Discovery',           score: 3.5, feedback: 'Discovery was technical (behavior-focused) rather than impact-focused. Did not explore how the problem affects the owner\'s life.', critical: true },
      { name: 'Problem Agitation',   score: 3.0, feedback: 'Surface-level agitation. No emotional cost or life impact established. Prospect stayed detached.', critical: true },
      { name: 'Offer Presentation',  score: 3.7, feedback: 'Program presented accurately. Specialization in reactivity mentioned. Not emotionally connected to the stated pain.', critical: false },
      { name: 'Objection Handling',  score: 2.9, feedback: 'Pulled back when Helen hesitated instead of advancing with empathy. Lost momentum at a critical moment.', critical: false },
      { name: 'Close & Next Steps',  score: 3.2, feedback: 'No close attempted. Call ended without a commitment or next step.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Taylor showed product knowledge but struggled to connect the product to Helen\'s real pain. The call was too technical and not emotional enough.',
    strengths: ['Knows the program specs and differentiators well'],
    improvements: [
      'Discovery too technical — focused on dog behaviors, not on the impact to the owner\'s life',
      'When Helen hesitated, Taylor pulled back instead of advancing with empathy',
    ],
    transcript: 'Taylor: Helen, which command specifically is Ziggy having trouble with? Stay, sit, or is it more aggression?\nHelen: He\'s very reactive to other dogs on walks...\nTaylor: I see. Reactivity is one of our specialties...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000619',
    trainerId: '00000000-0000-0000-0000-000000000304',
    trainerName: 'Taylor M.',
    date: '2026-03-17',
    duration: '28min',
    score: 71,
    result: 'no_outcome',
    prospect: 'Paul M.',
    rubricScores: { discovery: 68, problemAgitation: 58, offerPresentation: 72, objectionHandling: 55, closeAndNextSteps: 62 },
    sections: [
      { name: 'Discovery',           score: 3.4, feedback: 'Functional but shallow. Prospect\'s urgency and emotional stakes not explored.', critical: true },
      { name: 'Problem Agitation',   score: 2.9, feedback: 'Moved to the offer before Paul felt real urgency. Agitation phase was too brief.', critical: true },
      { name: 'Offer Presentation',  score: 3.6, feedback: 'Structured and complete presentation. Good product knowledge. No emotional hook.', critical: false },
      { name: 'Objection Handling',  score: 2.7, feedback: 'Immediately justified price when objection arose. Failed to probe root cause or reframe value. Went defensive.', critical: false },
      { name: 'Close & Next Steps',  score: 3.1, feedback: 'No close attempt after objection. Call ended without Paul committing to anything.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Second consecutive call without closing. Taylor is clearly struggling in the objection stage — goes defensive instead of keeping focus on value.',
    strengths: ['Structured and complete program presentation'],
    improvements: [
      'Price objection: immediately went into justification mode',
      'Problem agitation too quick — Paul didn\'t feel real urgency',
      'Didn\'t try to involve the prospect in the solution during the call',
    ],
    transcript: 'Paul: It\'s expensive for what it is...\nTaylor: I understand the price might seem high, but if you break it down by week...\nPaul: Hmm...\nTaylor: I can also explain what\'s included...\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000620',
    trainerId: '00000000-0000-0000-0000-000000000304',
    trainerName: 'Taylor M.',
    date: '2026-03-14',
    duration: '18min',
    score: 68,
    result: 'partial',
    prospect: 'Alice N.',
    rubricScores: { discovery: 65, problemAgitation: 57, offerPresentation: 71, objectionHandling: 53, closeAndNextSteps: 61 },
    sections: [
      { name: 'Discovery',           score: 3.2, feedback: 'Only 2 timid questions before moving to the offer. Alice\'s real situation never explored.', critical: true },
      { name: 'Problem Agitation',   score: 2.8, feedback: 'No real agitation. Moved from a vague problem description to "I\'ll send you info on WhatsApp."', critical: true },
      { name: 'Offer Presentation',  score: 3.5, feedback: 'Rushed and lacking confidence. Alice likely didn\'t perceive the real value.', critical: false },
      { name: 'Objection Handling',  score: 2.6, feedback: 'Call ended without Taylor knowing Alice\'s real reason for hesitation. No probe attempted.', critical: false },
      { name: 'Close & Next Steps',  score: 3.0, feedback: 'Follow-up scheduled via WhatsApp — low-commitment format. Better than nothing.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Very short call. Taylor seems to be feeling insecure — discovery questions were timid and the offer presentation was too rushed.',
    strengths: ['Scheduled a follow-up — at least didn\'t leave without a next step'],
    improvements: [
      'Discovery with only 2 questions before moving to the offer',
      'Insecure tone in the presentation — Alice probably didn\'t perceive the real value',
      'Call ended without Taylor knowing the real reason for the hesitation',
    ],
    transcript: 'Taylor: Alice, what motivated you to look into dog training?\nAlice: Mel has been chewing things around the house a bit...\nTaylor: Got it. Let me send you the program info via WhatsApp?\n...',
  },
  {
    id: '00000000-0000-0000-0000-000000000621',
    trainerId: '00000000-0000-0000-0000-000000000304',
    trainerName: 'Taylor M.',
    date: '2026-03-11',
    duration: '25min',
    score: 65,
    result: 'no_outcome',
    prospect: 'George T.',
    rubricScores: { discovery: 63, problemAgitation: 55, offerPresentation: 70, objectionHandling: 52, closeAndNextSteps: 60 },
    sections: [
      { name: 'Discovery',           score: 3.1, feedback: 'Prospect led the conversation from the start. Taylor failed to take control and direct the discovery.', critical: true },
      { name: 'Problem Agitation',   score: 2.7, feedback: 'No agitation attempt. The conversation stayed surface-level throughout.', critical: true },
      { name: 'Offer Presentation',  score: 3.5, feedback: 'Presentation was reactive — responding to George\'s questions rather than leading a structured pitch.', critical: false },
      { name: 'Objection Handling',  score: 2.6, feedback: '"Let me think" accepted without any probe or push. Call ended in a passive position.', critical: false },
      { name: 'Close & Next Steps',  score: 3.0, feedback: 'No close attempt. Ended with "let me think about what you said" — fully passive.', critical: false },
    ] satisfies CallSection[],
    feedback: 'Concerning call. Taylor is showing clear signs of low confidence. Voice was hesitant and he let the prospect lead the entire conversation.',
    strengths: ['Managed to keep George on the call for 25 minutes'],
    improvements: [
      'Let the prospect drive the call — lost control of the conversation',
      'Made no real attempt to close',
      'Ended the call with "let me think about what you said" — passive position',
    ],
    transcript: 'George: How much does it cost?\nTaylor: The investment is... it depends on the plan. Options start at...\nGeorge: Yeah, but what\'s the most basic one?\nTaylor: The basic includes...\nGeorge: Hmm, let me think...\nTaylor: Of course, no problem...\n...',
  },
]

// ─── Rubric Sections ─────────────────────────────────────────────────────────

export const rubricSections: RubricSection[] = [
  {
    id: 'discovery',
    name: 'Discovery',
    weight: 20,
    isCritical: true,
    description: 'Quality of open-ended questions and active listening. The trainer must identify the real pain before any presentation.',
    teamAvg: 82,
    color: 'blue',
    trainerScores: { marcus: 94, jamie: 88, jordan: 79, taylor: 67 },
  },
  {
    id: 'problemAgitation',
    name: 'Problem Agitation',
    weight: 25,
    isCritical: true,
    description: 'Ability to deepen and expand the prospect\'s pain, connecting the problem to real emotional and financial consequences.',
    teamAvg: 74,
    color: 'amber',
    trainerScores: { marcus: 89, jamie: 88, jordan: 61, taylor: 58 },
  },
  {
    id: 'offerPresentation',
    name: 'Offer Presentation',
    weight: 20,
    isCritical: false,
    description: 'Clarity and impact in presenting the offer. The product must be presented as the exact solution for the identified pain.',
    teamAvg: 82,
    color: 'green',
    trainerScores: { marcus: 95, jamie: 84, jordan: 80, taylor: 70 },
  },
  {
    id: 'objectionHandling',
    name: 'Objection Handling',
    weight: 25,
    isCritical: true,
    description: 'Handling price, time, and need objections without going defensive or offering a premature discount.',
    teamAvg: 71,
    color: 'red',
    trainerScores: { marcus: 81, jamie: 81, jordan: 65, taylor: 55 },
  },
  {
    id: 'closeAndNextSteps',
    name: 'Close & Next Steps',
    weight: 10,
    isCritical: true,
    description: 'Quality of the close and clarity of next steps. Every call must end with a clear commitment.',
    teamAvg: 75,
    color: 'accent2',
    trainerScores: { marcus: 90, jamie: 82, jordan: 65, taylor: 63 },
  },
]

// ─── Insights ─────────────────────────────────────────────────────────────────

export const insights: Insight[] = [
  {
    id: 'insight-1',
    type: 'risk',
    icon: '🚨',
    title: 'Objection Handling is the biggest revenue leak',
    tag: 'Team pattern',
    tagColor: 'red',
    summary:
      '3 of 4 trainers score below 70 on Objection Handling. Calls that skip this step close at 38% vs. 71% when executed correctly.',
    action:
      '30-min role-play focused on price objections. Use Marcus\'s calls as the benchmark.',
  },
  {
    id: 'insight-2',
    type: 'warning',
    icon: '⚠️',
    title: 'Taylor is at risk of disengagement',
    tag: 'Trainer alert',
    tagColor: 'amber',
    summary:
      'Score dropped 12pts in 2 weeks, call volume down 40%, and close rate is the lowest at 55%. This is a coaching emergency, not a performance issue.',
    action:
      'Schedule a 1:1 with Taylor. Review the last 3 calls and identify where confidence dropped.',
  },
  {
    id: 'insight-3',
    type: 'tip',
    icon: '💡',
    title: "Marcus's Discovery can elevate the whole team",
    tag: 'Best practices',
    tagColor: 'blue',
    summary:
      'Marcus scores 94 in Discovery — 11pts above average. He asks 3 open-ended questions before presenting the offer. No other trainer replicates this.',
    action:
      'Pull 2 clips from Marcus\'s calls and share as training material at the next team meeting.',
  },
  {
    id: 'insight-4',
    type: 'positive',
    icon: '📈',
    title: 'Coaching working — close rate +7pts in 6 weeks',
    tag: 'ROI signal',
    tagColor: 'green',
    summary:
      'Since starting AI coaching, close rate went from 57% → 64%. Biggest gain in Offer Presentation (+12pts team average).',
    action:
      'Keep the cadence. Consider daily uploads for faster feedback loops.',
  },
]

// ─── Plans ───────────────────────────────────────────────────────────────────

export const plans: Plan[] = [
  {
    id: '00000000-0000-0000-0000-0000000000a1',
    code: 'starter',
    name: 'Starter',
    priceCents: 405000,
    timelineWeeks: 2,
    hasRag: false,
    hasTwilio: false,
    hasManualUpload: true,
    maxSalesPeople: 4,
    features: [
      'Script & Rubric Manager',
      'Manual call upload (audio or transcript)',
      'AI analysis (Whisper + GPT-4o)',
      'Post-call coaching email',
      'Aggregated summary',
      'History page',
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000a2',
    code: 'pro',
    name: 'Pro',
    priceCents: 810000,
    timelineWeeks: 3,
    hasRag: false,
    hasTwilio: true,
    hasManualUpload: true,
    maxSalesPeople: null,
    features: [
      'Everything in Starter',
      'Twilio/GHL webhook integration',
      'Automated call ingestion',
      'Contact metadata sync',
      'Zero manual upload',
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000a3',
    code: 'pro_rag',
    name: 'Pro + RAG',
    priceCents: 1140700,
    timelineWeeks: 4,
    hasRag: true,
    hasTwilio: true,
    hasManualUpload: true,
    maxSalesPeople: null,
    features: [
      'Everything in Pro',
      'RAG system (vector search)',
      'Multi-document knowledge base',
      'Context-aware coaching',
      'Training material integration',
      'Dynamic reference lookup',
    ],
  },
]

const STARTER = plans[0]
const PRO     = plans[1]
const PRO_RAG = plans[2]

// ─── Clients (admin view) ────────────────────────────────────────────────────
// Mirrors the real Supabase rows (clients_rows.json):
//   801 → Dog Wizard HQ      (Pro,     org 100)
//   803 → K9 Elite Training  (Pro+RAG, org 200)
//   802 → Paw Academy        (Starter, org 300)

export const clients: Client[] = [
  {
    id: '00000000-0000-0000-0000-000000000801',
    name: 'Dog Wizard HQ',
    planId: PRO.id,
    plan: PRO,
    orgId: '00000000-0000-0000-0000-000000000100',
    callsThisMonth: 20,
    avgScore: 83,
    mrr: 1500,
    health: 'healthy',
    trainersCount: 4,
  },
  {
    id: '00000000-0000-0000-0000-000000000803',
    name: 'K9 Elite Training',
    planId: PRO_RAG.id,
    plan: PRO_RAG,
    orgId: '00000000-0000-0000-0000-000000000200',
    callsThisMonth: 35,
    avgScore: 88,
    mrr: 2500,
    health: 'healthy',
    trainersCount: 4,
  },
  {
    id: '00000000-0000-0000-0000-000000000802',
    name: 'Paw Academy',
    planId: STARTER.id,
    plan: STARTER,
    orgId: '00000000-0000-0000-0000-000000000300',
    callsThisMonth: 8,
    avgScore: 71,
    mrr: 500,
    health: 'at-risk',
    trainersCount: 4,
  },
]

export const globalMetrics: GlobalMetrics = {
  totalClients: 3,
  totalCallsThisMonth: 247,
  totalMRR: 1491,
  avgScore: 81,
}

// ─── Trend data ───────────────────────────────────────────────────────────────

export const trendData: TrendPoint[] = [
  { week: 'W1', closeRate: 57, score: 72 },
  { week: 'W2', closeRate: 60, score: 75 },
  { week: 'W3', closeRate: 62, score: 79 },
  { week: 'W4', closeRate: 65, score: 83 },
  { week: 'W5', closeRate: 64, score: 82 },
  { week: 'W6', closeRate: 68, score: 86 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const TRAINER_ID_TO_KEY: Record<string, keyof import('./types').TrainerScore> = {
  '00000000-0000-0000-0000-000000000301': 'marcus',
  '00000000-0000-0000-0000-000000000302': 'jamie',
  '00000000-0000-0000-0000-000000000303': 'jordan',
  '00000000-0000-0000-0000-000000000304': 'taylor',
}

// ─── Rubric (Supabase format) ────────────────────────────────────────────────

export const rubric = {
  id: 'rubric-001',
  name: 'Dog Training Sales Rubric',
  description: 'Standard rubric for dog training sales call evaluation',
  is_active: true,
  system_prompt: 'You are an expert sales coach for dog training businesses. Evaluate the call based on the rubric criteria.',
  llm_model: 'openai/gpt-4o-mini',
  created_at: '2026-03-01T10:00:00Z',
}

// ─── Scripts (Supabase format) ───────────────────────────────────────────────

export const scripts = [
  {
    id: 'script-001',
    name: 'Discovery-First Sales Script',
    description: 'Discovery-first script focused on deep discovery before presenting the offer. Based on Marcus R.\'s best practices.',
    rubric_id: 'rubric-001',
    is_active: true,
    created_at: '2026-03-01T12:00:00Z',
    sections: [
      { name: 'Opening', instructions: 'Greet and establish rapport. Ask what prompted the contact.', tips: 'Be genuine, don\'t use memorized scripts.' },
      { name: 'Discovery', instructions: 'Ask at least 3 open-ended questions before any presentation.', tips: 'Identify the real pain, not the symptom.' },
      { name: 'Problem Agitation', instructions: 'Deepen the pain by connecting the problem to emotional and financial impacts.', tips: 'Use questions like "and how does that affect..."' },
      { name: 'Offer Presentation', instructions: 'Connect the offer directly to the identified pain.', tips: 'Never present price before establishing value.' },
      { name: 'Close', instructions: 'Propose the next step clearly and confidently.', tips: 'Strategic silence after presenting the price.' },
    ],
    full_script: 'Complete dog training sales script...',
    criteria: [
      { name: 'Rapport Building', description: 'Trainer establishes connection in first 2 minutes' },
      { name: 'Open Questions', description: 'At least 3 open questions before presenting offer' },
      { name: 'Pain Identification', description: 'Identifies the real pain, not just the symptom' },
      { name: 'Emotional Connection', description: 'Connects the problem to emotional/financial impact' },
      { name: 'Value Before Price', description: 'Establishes value before revealing pricing' },
      { name: 'Clear Next Steps', description: 'Call ends with a clear commitment or next step' },
    ],
  },
  {
    id: 'script-002',
    name: 'Objection Handling Script',
    description: 'Script focused on price and time objection handling techniques.',
    rubric_id: 'rubric-001',
    is_active: true,
    created_at: '2026-03-05T14:00:00Z',
    sections: [
      { name: 'Objection Identification', instructions: 'Classify: price, time, authority, or need.', tips: 'Never respond immediately — pause.' },
      { name: 'Reframing', instructions: 'Recontextualize the investment in terms of the cost of inaction.', tips: '"How much does it cost NOT to solve this?"' },
      { name: 'Social Proof', instructions: 'Use specific cases from clients with a similar situation.', tips: 'Similar breed and problem work best.' },
    ],
    full_script: 'Objection handling script...',
    criteria: [
      { name: 'Objection Classification', description: 'Correctly identifies type of objection' },
      { name: 'Reframing Technique', description: 'Reframes objection in terms of cost of inaction' },
      { name: 'Social Proof', description: 'Uses relevant case study or testimonial' },
    ],
  },
]

// ─── Calls in Supabase format (for PostgREST handlers) ────────────────────

export const supabaseCalls = calls.map((call) => ({
  id: call.id,
  rubric_id: 'rubric-001',
  trainer_name: call.trainerName,
  trainer_email: `${call.trainerName.toLowerCase().replace(/\s+/g, '').replace('.', '')}@demo.askmoses.ai`,
  client_name: call.prospect,
  transcript: call.transcript,
  overall_score: call.score,
  total_criteria: 6,
  criteria: [
    { name: 'Discovery', score: call.rubricScores.discovery, feedback: 'Evaluated' },
    { name: 'Problem Agitation', score: call.rubricScores.problemAgitation, feedback: 'Evaluated' },
    { name: 'Offer Presentation', score: call.rubricScores.offerPresentation, feedback: 'Evaluated' },
    { name: 'Objection Handling', score: call.rubricScores.objectionHandling, feedback: 'Evaluated' },
    { name: 'Close & Next Steps', score: call.rubricScores.closeAndNextSteps, feedback: 'Evaluated' },
  ],
  summary: call.feedback,
  strengths: call.strengths,
  improvements: call.improvements,
  call_outcome: call.result,
  detected_outcome: call.result,
  email_sent: true,
  email_id: `email-${call.id}`,
  created_at: `${call.date}T10:00:00Z`,
}))

// ─── Revenue Impact Estimator ─────────────────────────────────────────────────

export const revenueEstimator: RevenueEstimatorItem[] = [
  { section: 'Objection Handling',  current: 71, target: 85, monthlyImpact: 2400, confidence: 'High' },
  { section: 'Assertiveness',       current: 65, target: 80, monthlyImpact: 1800, confidence: 'Med'  },
  { section: 'Close & Next Steps',  current: 75, target: 88, monthlyImpact: 1200, confidence: 'Low'  },
]

// ─── Performance Trends (per sales person + team aggregate) ──────────────────

export const performanceTrends: Record<string, PerformanceTrendPoint[]> = {
  // trainerId → trend data (keys match mock trainer IDs)
  '00000000-0000-0000-0000-000000000301': [ // Marcus R.
    { week: 'W1', closeRate: 60, avgScore: 72 },
    { week: 'W2', closeRate: 63, avgScore: 76 },
    { week: 'W3', closeRate: 65, avgScore: 80 },
    { week: 'W4', closeRate: 68, avgScore: 84 },
    { week: 'W5', closeRate: 71, avgScore: 88 },
    { week: 'W6', closeRate: 74, avgScore: 91 },
  ],
  '00000000-0000-0000-0000-000000000302': [ // Jamie L.
    { week: 'W1', closeRate: 55, avgScore: 70 },
    { week: 'W2', closeRate: 57, avgScore: 73 },
    { week: 'W3', closeRate: 60, avgScore: 75 },
    { week: 'W4', closeRate: 62, avgScore: 78 },
    { week: 'W5', closeRate: 65, avgScore: 81 },
    { week: 'W6', closeRate: 68, avgScore: 84 },
  ],
  '00000000-0000-0000-0000-000000000303': [ // Jordan K.
    { week: 'W1', closeRate: 50, avgScore: 68 },
    { week: 'W2', closeRate: 53, avgScore: 70 },
    { week: 'W3', closeRate: 56, avgScore: 73 },
    { week: 'W4', closeRate: 58, avgScore: 76 },
    { week: 'W5', closeRate: 60, avgScore: 79 },
    { week: 'W6', closeRate: 61, avgScore: 82 },
  ],
  '00000000-0000-0000-0000-000000000304': [ // Taylor M.
    { week: 'W1', closeRate: 59, avgScore: 74 },
    { week: 'W2', closeRate: 58, avgScore: 73 },
    { week: 'W3', closeRate: 57, avgScore: 71 },
    { week: 'W4', closeRate: 56, avgScore: 69 },
    { week: 'W5', closeRate: 55, avgScore: 67 },
    { week: 'W6', closeRate: 55, avgScore: 66 },
  ],
  team: [ // aggregate average across all sales people
    { week: 'W1', closeRate: 56, avgScore: 71 },
    { week: 'W2', closeRate: 58, avgScore: 73 },
    { week: 'W3', closeRate: 60, avgScore: 75 },
    { week: 'W4', closeRate: 61, avgScore: 77 },
    { week: 'W5', closeRate: 63, avgScore: 79 },
    { week: 'W6', closeRate: 65, avgScore: 81 },
  ],
}

export const revenueEstimatorTotal = revenueEstimator.reduce(
  (total, item) => total + item.monthlyImpact,
  0,
)

// ─── Demo credentials ─────────────────────────────────────────────────────────

// ─── Rubric Gap Detection ─────────────────────────────────────────────────────

export const rubricGaps: import('./types').RubricGap[] = [
  { frequency: 71, description: 'Price comparison to competitors not in rubric' },
  { frequency: 54, description: 'Follow-up timeline never set on call' },
  { frequency: 38, description: '"My dog is too old" objection unhandled' },
]

// ─── Correlation Engine ───────────────────────────────────────────────────────

export const correlationEngine: import('./types').CorrelationFactor[] = [
  { label: 'Objection Handling', score: 89, correlation: 'High', impact: 'High', source: 'Rubric' },
  { label: 'Assertiveness',      score: 83, correlation: 'High', impact: 'High', source: 'Behavioral' },
  { label: 'Close & Next Steps', score: 79, correlation: 'High', impact: 'High', source: 'Rubric' },
  { label: 'Tone & Energy',      score: 64, correlation: 'Med',  impact: 'Med',  source: 'Behavioral' },
  { label: 'Empathy',            score: 58, correlation: 'Med',  impact: 'Med',  source: 'Behavioral' },
  { label: 'Discovery',          score: 41, correlation: 'Low',  impact: 'Low',  source: 'Rubric' },
  { label: 'Problem Agitation',  score: 35, correlation: 'Low',  impact: 'Low',  source: 'Rubric' },
]

// ─── Best Call This Week ──────────────────────────────────────────────────────

export const bestCalls: import('./types').CallsByTrainerMap = {
  marcus: [
    {
      prospect: 'Bob W.',
      date:     '3/21/2026',
      score:    94,
      result:   'Closed',
      analysis: 'At 2:14 Marcus handled the price objection perfectly — acknowledged concern, reframed value, asked for the booking without hesitation.',
      listenAt: '2:14',
    },
    {
      prospect: 'Sarah K.',
      date:     '3/19/2026',
      score:    91,
      result:   'Closed',
      analysis: 'Discovery phase: asked 4 open-ended questions before presenting offer. No other trainer replicates this.',
      listenAt: '1:48',
    },
  ],
  jamie: [
    {
      prospect: 'Carlos M.',
      date:     '3/20/2026',
      score:    90,
      result:   'Closed',
      analysis: 'At 3:05 Jamie reframed the value proposition with a ROI story that resonated immediately — prospect stopped negotiating on price.',
      listenAt: '3:05',
    },
    {
      prospect: 'Dana P.',
      date:     '3/18/2026',
      score:    88,
      result:   'Closed',
      analysis: 'Strong close sequence: summarized pain points, confirmed fit, and asked for the next step decisively without over-explaining.',
      listenAt: '4:22',
    },
  ],
  jordan: [
    {
      prospect: 'Mike T.',
      date:     '3/22/2026',
      score:    84,
      result:   'Closed',
      analysis: 'At 1:50 Jordan handled the "my dog is too old" objection with a success story — effectively shifted emotional state of the prospect.',
      listenAt: '1:50',
    },
    {
      prospect: 'Lisa R.',
      date:     '3/17/2026',
      score:    81,
      result:   'Closed',
      analysis: 'Opened with a strong discovery question that uncovered the real pain (dog aggression at the park) before presenting any offer.',
      listenAt: '0:45',
    },
  ],
  taylor: [
    {
      prospect: 'Amy J.',
      date:     '3/21/2026',
      score:    78,
      result:   'Closed',
      analysis: 'At 2:30 Taylor used silence effectively after presenting the price — waited for the prospect to self-convince rather than filling the gap.',
      listenAt: '2:30',
    },
    {
      prospect: 'Ben C.',
      date:     '3/19/2026',
      score:    76,
      result:   'Closed',
      analysis: 'Strongest tone and energy of the week — kept energy high through a 25-minute call, matching the prospect\'s excitement level throughout.',
      listenAt: '5:10',
    },
  ],
  teamWeekly: [
    {
      trainerInitials: 'MR',
      trainerName:     'Marcus R.',
      trainerColor:    '#E87722',
      prospect:        'Bob W.',
      date:            '3/21/2026',
      score:           94,
      result:          'Closed',
      analysis:        'At 2:14 Marcus handled the price objection perfectly — acknowledged concern, reframed value, asked for the booking without hesitation.',
      listenAt:        '2:14',
    },
    {
      trainerInitials: 'JL',
      trainerName:     'Jamie L.',
      trainerColor:    '#3B82F6',
      prospect:        'Sarah K.',
      date:            '3/19/2026',
      score:           91,
      result:          'Closed',
      analysis:        'Discovery phase: asked 4 open-ended questions before presenting offer. No other trainer replicates this pattern.',
      listenAt:        '1:48',
    },
  ],
}

// ─── Worst Call This Week ─────────────────────────────────────────────────────

export const worstCalls: import('./types').CallsByTrainerMap = {
  marcus: [
    {
      prospect: 'Greg N.',
      date:     '3/18/2026',
      score:    61,
      result:   'No Close',
      analysis: 'At 1:42 Marcus skipped discovery entirely and jumped straight to pricing — prospect disengaged after 3 minutes. No pain established before the offer.',
      listenAt: '1:42',
    },
    {
      prospect: 'Pam D.',
      date:     '3/20/2026',
      score:    64,
      result:   'No Close',
      analysis: 'Objection at 4:10 ("too expensive") was met with silence, then a discount offer — reinforced price anchoring without defending value.',
      listenAt: '4:10',
    },
  ],
  jamie: [
    {
      prospect: 'Tom R.',
      date:     '3/19/2026',
      score:    63,
      result:   'No Close',
      analysis: 'At 2:55 Jamie talked over the prospect\'s hesitation instead of asking a clarifying question. Lost the emotional thread and never recovered.',
      listenAt: '2:55',
    },
    {
      prospect: 'Nora S.',
      date:     '3/21/2026',
      score:    66,
      result:   'Follow-up',
      analysis: 'Offer presentation was vague — benefits listed without connecting them to the prospect\'s stated problems. No urgency created.',
      listenAt: '3:40',
    },
  ],
  jordan: [
    {
      prospect: 'Fred L.',
      date:     '3/17/2026',
      score:    58,
      result:   'No Close',
      analysis: 'At 0:55 Jordan agreed with the prospect that "maybe now isn\'t the right time" — self-sabotaged before the offer was even presented.',
      listenAt: '0:55',
    },
    {
      prospect: 'Cara B.',
      date:     '3/20/2026',
      score:    62,
      result:   'No Close',
      analysis: 'Close sequence at 5:15 was rushed — asked for the sale twice in 30 seconds without pausing for a response, creating pressure that backfired.',
      listenAt: '5:15',
    },
  ],
  taylor: [
    {
      prospect: 'Owen M.',
      date:     '3/18/2026',
      score:    55,
      result:   'No Close',
      analysis: 'At 3:00 Taylor filled every silence with filler words instead of letting the prospect process. Nervous energy was audible and undermined trust.',
      listenAt: '3:00',
    },
    {
      prospect: 'Iris W.',
      date:     '3/22/2026',
      score:    59,
      result:   'No Close',
      analysis: 'Problem agitation phase was skipped entirely — moved from intro to offer in under 90 seconds. Prospect had no emotional reason to buy.',
      listenAt: '1:28',
    },
  ],
  teamWeekly: [
    {
      trainerInitials: 'TM',
      trainerName:     'Taylor M.',
      trainerColor:    '#A855F7',
      prospect:        'Owen M.',
      date:            '3/18/2026',
      score:           55,
      result:          'No Close',
      analysis:        'At 3:00 Taylor filled every silence with filler words instead of letting the prospect process. Nervous energy was audible and undermined trust.',
      listenAt:        '3:00',
    },
    {
      trainerInitials: 'JK',
      trainerName:     'Jordan K.',
      trainerColor:    '#22D9A0',
      prospect:        'Fred L.',
      date:            '3/17/2026',
      score:           58,
      result:          'No Close',
      analysis:        'At 0:55 Jordan agreed with the prospect that "maybe now isn\'t the right time" — self-sabotaged before the offer was even presented.',
      listenAt:        '0:55',
    },
  ],
}

// ─── Coaching Recommendations ────────────────────────────────────────────────

export type CtaKey = 'reference' | 'share' | 'viewMissing' | 'viewCalls' | 'viewScript'

export type CoachingRec = {
  order: number
  title: string
  text: string
  /** Display label for the CTA button. May be translated server-side. */
  cta: string
  /** Stable identifier used for styling/behavior — never translated. */
  ctaKey: CtaKey
}

export const coachingRecs: Record<string, CoachingRec[]> = {
  marcus: [
    {
      order: 1,
      title: 'Work on empathy',
      text: 'Trending down 3 weeks. Pull Lisa M. call and identify where emotional connection dropped.',
      cta: 'Reference call →',
      ctaKey: 'reference',
    },
    {
      order: 2,
      title: "Use Marcus's Bob W. call as team training",
      text: 'Best objection handling example in 6 weeks — share at next team meeting.',
      cta: 'Share call →',
      ctaKey: 'share',
    },
    {
      order: 3,
      title: 'Review 3 missing calls before next session',
      text: 'Submission gaps are a coaching signal, not just a compliance issue.',
      cta: 'View missing →',
      ctaKey: 'viewMissing',
    },
  ],
  jamie: [
    {
      order: 1,
      title: 'Close more decisively',
      text: 'Last 3 calls ended without a firm commitment. Pull the Karen H. follow-up and practice a direct close script.',
      cta: 'Reference call →',
      ctaKey: 'reference',
    },
    {
      order: 2,
      title: 'Identify co-decision makers early',
      text: 'Two calls this month were derailed by an unidentified second decision-maker. Add one qualifying question in discovery.',
      cta: 'View script →',
      ctaKey: 'viewScript',
    },
    {
      order: 3,
      title: 'Use Diana M. call in the next team session',
      text: 'Best problem agitation example on the team — empathetic and never manipulative.',
      cta: 'Share call →',
      ctaKey: 'share',
    },
  ],
  jordan: [
    {
      order: 1,
      title: 'Stop jumping to the offer too early',
      text: 'Presenting the offer before minute 15 correlates with 0% close rate for Jordan. Add a problem agitation checkpoint.',
      cta: 'View script →',
      ctaKey: 'viewScript',
    },
    {
      order: 2,
      title: 'No more discounts without objection reframe',
      text: "Jordan offered a discount in 2 of 5 calls this week. Review Marcus's objection handling technique first.",
      cta: 'Reference call →',
      ctaKey: 'reference',
    },
    {
      order: 3,
      title: 'Set a specific follow-up time on every call',
      text: 'Vague follow-ups ("I\'ll send you info") have zero conversion. Commit to a date and time before hanging up.',
      cta: 'View missing →',
      ctaKey: 'viewMissing',
    },
  ],
  taylor: [
    {
      order: 1,
      title: 'Schedule a 1:1 this week — priority',
      text: 'Score dropped 12pts in 2 weeks and call volume is down 40%. This is a confidence issue, not a skills gap.',
      cta: 'View calls →',
      ctaKey: 'viewCalls',
    },
    {
      order: 2,
      title: 'Stop over-explaining after presenting price',
      text: 'Taylor fills silence with justifications. Review the strategic silence technique from Marcus\'s Bob W. call.',
      cta: 'Reference call →',
      ctaKey: 'reference',
    },
    {
      order: 3,
      title: 'Focus discovery on emotional impact, not behaviors',
      text: 'Questions are too technical. Ask "how does this affect your family?" not "which command is the problem?"',
      cta: 'View script →',
      ctaKey: 'viewScript',
    },
  ],
}

// ─── Behavioral Correlation Profile ──────────────────────────────────────────

export type BehavioralDimension = {
  dimension: string
  score: number
  delta: number
  teamAvg: number
  source: 'Rubric' | 'Behavioral'
}

export const trainerBehavioral: Record<string, BehavioralDimension[]> = {
  marcus: [
    { dimension: 'Objection Handling', score: 94, delta: 23,  teamAvg: 71, source: 'Rubric'     },
    { dimension: 'Assertiveness',      score: 91, delta: 26,  teamAvg: 65, source: 'Behavioral' },
    { dimension: 'Close & Next Steps', score: 90, delta: 15,  teamAvg: 75, source: 'Rubric'     },
    { dimension: 'Discovery',          score: 94, delta: 12,  teamAvg: 82, source: 'Rubric'     },
    { dimension: 'Tone & Energy',      score: 78, delta: 6,   teamAvg: 72, source: 'Behavioral' },
    { dimension: 'Empathy',            score: 65, delta: -5,  teamAvg: 70, source: 'Behavioral' },
  ],
  jamie: [
    { dimension: 'Objection Handling', score: 81, delta: 10,  teamAvg: 71, source: 'Rubric'     },
    { dimension: 'Assertiveness',      score: 79, delta: 14,  teamAvg: 65, source: 'Behavioral' },
    { dimension: 'Close & Next Steps', score: 82, delta: 7,   teamAvg: 75, source: 'Rubric'     },
    { dimension: 'Discovery',          score: 88, delta: 6,   teamAvg: 82, source: 'Rubric'     },
    { dimension: 'Tone & Energy',      score: 74, delta: 2,   teamAvg: 72, source: 'Behavioral' },
    { dimension: 'Empathy',            score: 80, delta: 10,  teamAvg: 70, source: 'Behavioral' },
  ],
  jordan: [
    { dimension: 'Objection Handling', score: 65, delta: -6,  teamAvg: 71, source: 'Rubric'     },
    { dimension: 'Assertiveness',      score: 60, delta: -5,  teamAvg: 65, source: 'Behavioral' },
    { dimension: 'Close & Next Steps', score: 65, delta: -10, teamAvg: 75, source: 'Rubric'     },
    { dimension: 'Discovery',          score: 79, delta: -3,  teamAvg: 82, source: 'Rubric'     },
    { dimension: 'Tone & Energy',      score: 68, delta: -4,  teamAvg: 72, source: 'Behavioral' },
    { dimension: 'Empathy',            score: 72, delta: 2,   teamAvg: 70, source: 'Behavioral' },
  ],
  taylor: [
    { dimension: 'Objection Handling', score: 55, delta: -16, teamAvg: 71, source: 'Rubric'     },
    { dimension: 'Assertiveness',      score: 52, delta: -13, teamAvg: 65, source: 'Behavioral' },
    { dimension: 'Close & Next Steps', score: 63, delta: -12, teamAvg: 75, source: 'Rubric'     },
    { dimension: 'Discovery',          score: 67, delta: -15, teamAvg: 82, source: 'Rubric'     },
    { dimension: 'Tone & Energy',      score: 61, delta: -11, teamAvg: 72, source: 'Behavioral' },
    { dimension: 'Empathy',            score: 66, delta: -4,  teamAvg: 70, source: 'Behavioral' },
  ],
}

// ─── Behavioral Trends — 6 Weeks ─────────────────────────────────────────────

export type BehavioralTrendDimension = {
  dimension: string
  trend: number[]
  currentScore: number
}

export const trainerTrends: Record<string, BehavioralTrendDimension[]> = {
  marcus: [
    { dimension: 'Objection Handling', trend: [72, 78, 82, 86, 90, 94], currentScore: 94 },
    { dimension: 'Assertiveness',      trend: [68, 73, 77, 83, 87, 91], currentScore: 91 },
    { dimension: 'Empathy',            trend: [72, 69, 64, 61, 63, 65], currentScore: 65 },
    { dimension: 'Tone & Energy',      trend: [60, 64, 68, 71, 75, 78], currentScore: 78 },
  ],
  jamie: [
    { dimension: 'Objection Handling', trend: [68, 71, 74, 76, 79, 81], currentScore: 81 },
    { dimension: 'Assertiveness',      trend: [63, 67, 70, 74, 77, 79], currentScore: 79 },
    { dimension: 'Empathy',            trend: [71, 73, 76, 78, 79, 80], currentScore: 80 },
    { dimension: 'Tone & Energy',      trend: [66, 69, 71, 72, 73, 74], currentScore: 74 },
  ],
  jordan: [
    { dimension: 'Objection Handling', trend: [74, 72, 70, 68, 66, 65], currentScore: 65 },
    { dimension: 'Assertiveness',      trend: [68, 66, 64, 62, 61, 60], currentScore: 60 },
    { dimension: 'Empathy',            trend: [67, 68, 70, 71, 72, 72], currentScore: 72 },
    { dimension: 'Tone & Energy',      trend: [74, 72, 71, 70, 69, 68], currentScore: 68 },
  ],
  taylor: [
    { dimension: 'Objection Handling', trend: [68, 65, 62, 59, 57, 55], currentScore: 55 },
    { dimension: 'Assertiveness',      trend: [60, 58, 56, 54, 53, 52], currentScore: 52 },
    { dimension: 'Empathy',            trend: [62, 63, 64, 65, 66, 66], currentScore: 66 },
    { dimension: 'Tone & Energy',      trend: [68, 66, 64, 63, 62, 61], currentScore: 61 },
  ],
}

// ─── Active Alerts ────────────────────────────────────────────────────────────

export type ActiveAlert = {
  type: 'critical' | 'warning' | 'positive'
  dotColor: 'red' | 'amber' | 'green'
  message: string
  cta: string
}

export const activeAlerts: ActiveAlert[] = [
  {
    type: 'critical',
    dotColor: 'red',
    message: "Taylor's score dropped 12pts this week",
    cta: 'Review calls',
  },
  {
    type: 'warning',
    dotColor: 'amber',
    message: '3 trainers skipping objection handling',
    cta: 'Train now',
  },
  {
    type: 'positive',
    dotColor: 'green',
    message: 'Close rate up 7pts in 6 weeks',
    cta: 'Celebrate',
  },
]

// ─── Team Health ─────────────────────────────────────────────────────────────

export type TeamHealthEntry = {
  initials: string
  name: string
  avatarColor: 'blue' | 'purple' | 'green' | 'red' | 'amber'
  calls: number
  status: string
  statusType: 'active' | 'recent' | 'away'
  closeRate: number
  delta: number
  trend: 'up' | 'down'
}

export const teamHealth: TeamHealthEntry[] = [
  { initials: 'MR', name: 'Marcus R.',  avatarColor: 'amber',  calls: 28, status: 'active today', statusType: 'active', closeRate: 74, delta:  9, trend: 'up'   },
  { initials: 'JL', name: 'Jamie L.',   avatarColor: 'blue',   calls: 22, status: 'yesterday',    statusType: 'recent', closeRate: 68, delta:  4, trend: 'up'   },
  { initials: 'JK', name: 'Jordan K.',  avatarColor: 'purple', calls: 19, status: 'active today', statusType: 'active', closeRate: 61, delta:  1, trend: 'up'   },
  { initials: 'TM', name: 'Taylor M.',  avatarColor: 'green',  calls: 14, status: '3 days ago',   statusType: 'away',   closeRate: 55, delta: -2, trend: 'down' },
]

export const demoCredentials = [
  { email: 'trainer@demo.askmoses.ai',  password: 'demo123', role: 'trainer' as Role, name: 'Marcus R.',      trainerId: '00000000-0000-0000-0000-000000000301' as string | null },
  { email: 'trainer2@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Jamie L.',       trainerId: '00000000-0000-0000-0000-000000000302'  as string | null },
  { email: 'trainer3@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Jordan K.',      trainerId: '00000000-0000-0000-0000-000000000303' as string | null },
  { email: 'trainer4@demo.askmoses.ai', password: 'demo123', role: 'trainer' as Role, name: 'Taylor M.',      trainerId: '00000000-0000-0000-0000-000000000304' as string | null },
  { email: 'owner@demo.askmoses.ai',    password: 'demo123', role: 'owner'   as Role, name: 'Dog Wizard HQ',  trainerId: null },
  { email: 'admin@askmoses.ai',         password: 'demo123', role: 'admin'   as Role, name: 'AskMoses Admin', trainerId: null },
]

