-- ============================================================
-- 013_seed_demo_org.sql
-- Cria a organização de demo "Dog Wizard HQ" e insere todos
-- os dados mock (users, trainers, rubric, criteria, calls,
-- insights, clients) já vinculados ao org_id.
-- ============================================================

-- ─── IDs fixos para referência cruzada ───────────────────────────────────────

-- org
-- 00000000-0000-0000-0000-000000000100  → Dog Wizard HQ (demo org)

-- users (auth.users são criados via Supabase Auth — estes são da tabela public.users)
-- 00000000-0000-0000-0000-000000000201  → Marcus R.
-- 00000000-0000-0000-0000-000000000202  → Jamie L.
-- 00000000-0000-0000-0000-000000000203  → Jordan K.
-- 00000000-0000-0000-0000-000000000204  → Taylor M.

-- trainers
-- 00000000-0000-0000-0000-000000000301  → Marcus R.
-- 00000000-0000-0000-0000-000000000302  → Jamie L.
-- 00000000-0000-0000-0000-000000000303  → Jordan K.
-- 00000000-0000-0000-0000-000000000304  → Taylor M.

-- rubric
-- b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d  → Dog Training Sales Rubric (já existe em 001_create_rubrics)

-- calls (UUIDs fixos — mapeados do mock)
-- 00000000-0000-0000-0000-000000000601  → call-001 (Marcus / Bob W.)
-- 00000000-0000-0000-0000-000000000602  → call-002 (Marcus / Sarah K.)
-- 00000000-0000-0000-0000-000000000603  → call-003 (Marcus / Mike D.)
-- 00000000-0000-0000-0000-000000000604  → call-004 (Marcus / Linda P.)
-- 00000000-0000-0000-0000-000000000605  → call-005 (Marcus / Tom R.)
-- 00000000-0000-0000-0000-000000000606  → call-006 (Marcus / Amy C.)
-- 00000000-0000-0000-0000-000000000607  → call-007 (Marcus / Chris B.)
-- 00000000-0000-0000-0000-000000000608  → call-008 (Jamie / Diana M.)
-- 00000000-0000-0000-0000-000000000609  → call-009 (Jamie / Robert L.)
-- 00000000-0000-0000-0000-000000000610  → call-010 (Jamie / Karen H.)
-- 00000000-0000-0000-0000-000000000611  → call-011 (Jamie / Steve N.)
-- 00000000-0000-0000-0000-000000000612  → call-012 (Jamie / Nancy W.)
-- 00000000-0000-0000-0000-000000000613  → call-013 (Jordan / Peter G.)
-- 00000000-0000-0000-0000-000000000614  → call-014 (Jordan / Donna F.)
-- 00000000-0000-0000-0000-000000000615  → call-015 (Jordan / Mark T.)
-- 00000000-0000-0000-0000-000000000616  → call-016 (Jordan / Susan B.)
-- 00000000-0000-0000-0000-000000000617  → call-017 (Jordan / James R.)
-- 00000000-0000-0000-0000-000000000618  → call-018 (Taylor / Helen K.)
-- 00000000-0000-0000-0000-000000000619  → call-019 (Taylor / Paul M.)
-- 00000000-0000-0000-0000-000000000620  → call-020 (Taylor / Alice N.)
-- 00000000-0000-0000-0000-000000000621  → call-021 (Taylor / George T.)

-- clients (orgs clientes — visão admin)
-- 00000000-0000-0000-0000-000000000401  → Paw Masters Academy
-- 00000000-0000-0000-0000-000000000402  → Elite K9 Training
-- 00000000-0000-0000-0000-000000000403  → Dog Whisperers Co.

-- ─── 1. Organização de demo ──────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, avg_ticket, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  'Dog Wizard HQ',
  1500,
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ─── 2. Users (tabela public.users — perfis dos trainers) ────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  avatar       TEXT,
  avatar_color TEXT DEFAULT 'blue',
  role         TEXT NOT NULL CHECK (role IN ('trainer', 'owner', 'admin')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.users (id, name, email, avatar, avatar_color, role)
VALUES
  ('00000000-0000-0000-0000-000000000201', 'Marcus R.',  'marcus@demo.askmoses.ai',  'MR', 'blue',   'trainer'),
  ('00000000-0000-0000-0000-000000000202', 'Jamie L.',   'jamie@demo.askmoses.ai',   'JL', 'purple', 'trainer'),
  ('00000000-0000-0000-0000-000000000203', 'Jordan K.',  'jordan@demo.askmoses.ai',  'JK', 'green',  'trainer'),
  ('00000000-0000-0000-0000-000000000204', 'Taylor M.',  'taylor@demo.askmoses.ai',  'TM', 'red',    'trainer')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  email        = EXCLUDED.email,
  avatar       = EXCLUDED.avatar,
  avatar_color = EXCLUDED.avatar_color,
  role         = EXCLUDED.role;

-- ─── 3. Trainers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trainers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES public.users(id) ON DELETE CASCADE,
  owner_id                  UUID,
  org_id                    UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  total_calls               INT DEFAULT 0,
  close_rate                INT DEFAULT 0,
  close_delta               INT DEFAULT 0,
  score                     INT DEFAULT 0,
  score_delta               INT DEFAULT 0,
  last_active               TEXT,
  score_discovery           INT DEFAULT 0,
  score_problem_agitation   INT DEFAULT 0,
  score_offer_presentation  INT DEFAULT 0,
  score_objection_handling  INT DEFAULT 0,
  score_close_next_steps    INT DEFAULT 0,
  updated_at                TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.trainers (
  id, user_id, org_id,
  total_calls, close_rate, close_delta, score, score_delta, last_active,
  score_discovery, score_problem_agitation, score_offer_presentation,
  score_objection_handling, score_close_next_steps
)
VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000100',
    28, 74, 9, 91, 11, 'Active today',
    94, 89, 95, 81, 90
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000100',
    22, 68, 4, 87, 7, 'Yesterday',
    88, 88, 84, 81, 82
  ),
  (
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000100',
    19, 61, 1, 79, 3, 'Active today',
    79, 61, 80, 65, 65
  ),
  (
    '00000000-0000-0000-0000-000000000304',
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000100',
    14, 55, -2, 74, -12, '3 days ago',
    67, 58, 70, 55, 63
  )
ON CONFLICT (id) DO UPDATE SET
  org_id                   = EXCLUDED.org_id,
  total_calls              = EXCLUDED.total_calls,
  close_rate               = EXCLUDED.close_rate,
  close_delta              = EXCLUDED.close_delta,
  score                    = EXCLUDED.score,
  score_delta              = EXCLUDED.score_delta,
  last_active              = EXCLUDED.last_active,
  score_discovery          = EXCLUDED.score_discovery,
  score_problem_agitation  = EXCLUDED.score_problem_agitation,
  score_offer_presentation = EXCLUDED.score_offer_presentation,
  score_objection_handling = EXCLUDED.score_objection_handling,
  score_close_next_steps   = EXCLUDED.score_close_next_steps,
  updated_at               = now();

-- ─── 4. Vincular org_id à rubric existente (criada em 001) ───────────────────

UPDATE public.rubrics
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';

-- Vincular criteria ao org_id
UPDATE public.criteria
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';

-- ─── 5. Calls (21 calls do mock) ─────────────────────────────────────────────

INSERT INTO public.calls (
  id, rubric_id, org_id, trainer_id, trainer_name, trainer_email, client_name,
  transcript, overall_score, total_criteria, criteria, summary,
  strengths, improvements, call_outcome, detected_outcome,
  email_sent, created_at, updated_at
)
VALUES
  -- Marcus R. (7 calls)
  (
    '00000000-0000-0000-0000-000000000601', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Bob W.',
    'Marcus: Hi Bob, thanks for making time today. Before anything else, tell me — what''s going on with Rex that brought you to us?
Bob: Man, he just doesn''t listen to anything. We can barely leave the house with him.
Marcus: I get it. When you say he doesn''t listen — give me a concrete example from recently.
Bob: Last week he escaped the yard for the third time. We spent two hours looking for him in the neighborhood.
Marcus: Wow, that must''ve been terrifying. Does this affect your daily life beyond the safety concern?
Bob: Absolutely. My daughter is scared to play with him now, and my wife said if it doesn''t get fixed, we''ll have to rehome him.
Marcus: I understand the gravity of that. Before I show you what we do — have you tried anything before? Group classes, YouTube, another trainer?
...',
    94, 5,
    '[{"name":"Discovery","score":96,"feedback":"Evaluated"},{"name":"Problem Agitation","score":91,"feedback":"Evaluated"},{"name":"Offer Presentation","score":97,"feedback":"Evaluated"},{"name":"Objection Handling","score":84,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":92,"feedback":"Evaluated"}]'::jsonb,
    'Excellent performance. Marcus demonstrated complete mastery of the discovery process, asking 4 open-ended questions before any presentation. The close was natural and pressure-free.',
    ARRAY['Asked 4 open-ended questions before presenting any offer','Identified the main pain point (Rex escaping the yard) in under 5 minutes','Handled price objection using concrete ROI: "how much does a lost dog cost?"'],
    ARRAY['Could have deepened problem agitation more before moving to the offer'],
    'closed', 'closed', false, '2026-03-22T10:00:00Z', '2026-03-22T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000602', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Sarah K.',
    'Marcus: Sarah, tell me a bit about Thor. What motivated you to reach out today?
Sarah: He''s destroying everything at home when we leave. Sofa, baseboards, he was even scratching the door...
Marcus: How long has this been going on?
Sarah: Since we went back to working in-office, about 4 months or so.
...',
    91, 5,
    '[{"name":"Discovery","score":95,"feedback":"Evaluated"},{"name":"Problem Agitation","score":88,"feedback":"Evaluated"},{"name":"Offer Presentation","score":94,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":90,"feedback":"Evaluated"}]'::jsonb,
    'Great call. Marcus used the open-ended questioning method masterfully. The objection moment was handled well by redirecting focus to the value of the transformation.',
    ARRAY['Discovered in 3 questions that the dog was destroying furniture due to separation anxiety','Presented the offer as the exact solution for the identified pain','Closed without a discount, holding full price'],
    ARRAY['Problem agitation could have been more specific with numbers and costs'],
    'closed', 'closed', false, '2026-03-20T10:00:00Z', '2026-03-20T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000603', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Mike D.',
    'Marcus: Mike, what''s going on with Bolt?
Mike: He pulls the leash like crazy. I walk crooked from holding him so tight. I''m embarrassed to take him to the park...
...',
    89, 5,
    '[{"name":"Discovery","score":93,"feedback":"Evaluated"},{"name":"Problem Agitation","score":87,"feedback":"Evaluated"},{"name":"Offer Presentation","score":92,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":88,"feedback":"Evaluated"}]'::jsonb,
    'Solid call. Discovery well executed, offer presented at the right time. Minor hesitation on the time objection, but handled well.',
    ARRAY['Discovered the real issue was embarrassment on the street, not just behavior at home','Used specific social proof: "we had a Golden with the same problem..."'],
    ARRAY['Could have spent more time in the agitation phase before presenting the solution'],
    'closed', 'closed', false, '2026-03-18T10:00:00Z', '2026-03-18T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000604', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Linda P.',
    'Marcus: Linda, how old is Bella now?
Linda: Almost 8 months. And she''s already too big for us to hold when she gets hyper...
...',
    88, 5,
    '[{"name":"Discovery","score":92,"feedback":"Evaluated"},{"name":"Problem Agitation","score":86,"feedback":"Evaluated"},{"name":"Offer Presentation","score":91,"feedback":"Evaluated"},{"name":"Objection Handling","score":79,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":88,"feedback":"Evaluated"}]'::jsonb,
    'Good performance. Longer call than usual, but Marcus maintained control of the conversation throughout.',
    ARRAY['Kept the prospect engaged for 45 minutes with strategic questions','Created real urgency by mentioning limited spots in the in-person program'],
    ARRAY['Next steps could have been more specific — ended without a set date'],
    'closed', 'closed', false, '2026-03-15T10:00:00Z', '2026-03-15T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000605', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Tom R.',
    'Marcus: Tom, first of all — do you already know our method or are you coming in fresh?
Tom: I''ve done a lot of research. Saw the testimonials on Instagram. Just want to know how it works in practice.
...',
    86, 5,
    '[{"name":"Discovery","score":91,"feedback":"Evaluated"},{"name":"Problem Agitation","score":84,"feedback":"Evaluated"},{"name":"Offer Presentation","score":89,"feedback":"Evaluated"},{"name":"Objection Handling","score":78,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":86,"feedback":"Evaluated"}]'::jsonb,
    'Efficient and quick call. Marcus correctly identified that Tom was ready to buy from the start and adjusted the pace accordingly.',
    ARRAY['Correctly read that the prospect was qualified and accelerated the call','Presented the plans in ascending order of value'],
    ARRAY['Discovery was a bit short — could have extracted more information'],
    'closed', 'closed', false, '2026-03-12T10:00:00Z', '2026-03-12T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000606', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Amy C.',
    'Marcus: Amy, tell me — when you picture Duke fully trained, how do you see your day-to-day looking different?
Amy: It would be amazing. We could take him anywhere without stress...
...',
    85, 5,
    '[{"name":"Discovery","score":93,"feedback":"Evaluated"},{"name":"Problem Agitation","score":88,"feedback":"Evaluated"},{"name":"Offer Presentation","score":90,"feedback":"Evaluated"},{"name":"Objection Handling","score":76,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":83,"feedback":"Evaluated"}]'::jsonb,
    'Excellent discovery and presentation. The call didn''t close because Amy needed to confirm schedule availability with her husband — follow-up booked for 2 days out.',
    ARRAY['Identified the co-decision maker (husband) before attempting to close','Left the follow-up with a specific date and time, not open-ended'],
    ARRAY['Could have suggested including the husband on the call instead of rescheduling'],
    'follow_up', 'follow_up', false, '2026-03-09T10:00:00Z', '2026-03-09T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000607', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Chris B.',
    'Marcus: Chris, in the current situation without training — how much do you think Max''s behavior is actually "costing" you?
Chris: Never thought about it that way...
Marcus: The couch he destroyed, the vet visits from stress, the restriction of traveling with him...
...',
    82, 5,
    '[{"name":"Discovery","score":90,"feedback":"Evaluated"},{"name":"Problem Agitation","score":85,"feedback":"Evaluated"},{"name":"Offer Presentation","score":88,"feedback":"Evaluated"},{"name":"Objection Handling","score":72,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":82,"feedback":"Evaluated"}]'::jsonb,
    'Good call with consistent close. The price objection came in stronger than usual and Marcus took a moment to regain control.',
    ARRAY['Kept a calm tone during the more resistant price objection','Used the strategic silence technique after presenting the price'],
    ARRAY['The response to the price objection could have been quicker and less defensive'],
    'closed', 'closed', false, '2026-03-06T10:00:00Z', '2026-03-06T10:00:00Z'
  ),
  -- Jamie L. (5 calls)
  (
    '00000000-0000-0000-0000-000000000608', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Diana M.',
    'Jamie: Diana, what happens at your house when you need to have guests over?
Diana: It''s chaos. Toby barks and jumps on everyone. I even stopped having my mom over because of it...
Jamie: How long has this been going on?
Diana: Over a year. I''m exhausted...
...',
    90, 5,
    '[{"name":"Discovery","score":91,"feedback":"Evaluated"},{"name":"Problem Agitation","score":90,"feedback":"Evaluated"},{"name":"Offer Presentation","score":88,"feedback":"Evaluated"},{"name":"Objection Handling","score":84,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":87,"feedback":"Evaluated"}]'::jsonb,
    'Excellent call from Jamie. The problem agitation was particularly strong — Diana became visibly emotional talking about how much stress the dog was causing.',
    ARRAY['Problem agitation delivered with genuine empathy — didn''t come across as manipulative','Close made before resistance surfaced'],
    ARRAY['Discovery could have explored more about prior attempts'],
    'closed', 'closed', false, '2026-03-21T10:00:00Z', '2026-03-21T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000609', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Robert L.',
    'Jamie: Robert, when you say Luna "doesn''t focus" — describe a specific situation from last week.
Robert: Just yesterday. I tried teaching "sit" for half an hour. She knows how to do it, but ignores me when she wants...
...',
    85, 5,
    '[{"name":"Discovery","score":88,"feedback":"Evaluated"},{"name":"Problem Agitation","score":86,"feedback":"Evaluated"},{"name":"Offer Presentation","score":84,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":82,"feedback":"Evaluated"}]'::jsonb,
    'Well-conducted and efficient call. Robert was already aware of the problem and Jamie correctly calibrated the intensity of the agitation.',
    ARRAY['Correctly calibrated agitation level for a prospect already aware of the problem','Presented cases of a similar breed (Border Collie)'],
    ARRAY['The close could have been more directive — felt slightly hesitant'],
    'closed', 'closed', false, '2026-03-19T10:00:00Z', '2026-03-19T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000610', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Karen H.',
    'Jamie: Karen, what made you decide to look for a professional trainer now?
Karen: My husband was reluctant, but after Buddy scratched the child, we agreed we needed help...
...',
    82, 5,
    '[{"name":"Discovery","score":87,"feedback":"Evaluated"},{"name":"Problem Agitation","score":85,"feedback":"Evaluated"},{"name":"Offer Presentation","score":82,"feedback":"Evaluated"},{"name":"Objection Handling","score":78,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":80,"feedback":"Evaluated"}]'::jsonb,
    'Good call. Karen is a shared decision-maker with her husband and Jamie identified this halfway through — follow-up to include him.',
    ARRAY['Didn''t try to close knowing there was another decision-maker in the equation','Maintained Karen''s engagement for the next call'],
    ARRAY['The co-decision maker question could have been identified earlier in discovery'],
    'follow_up', 'follow_up', false, '2026-03-16T10:00:00Z', '2026-03-16T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000611', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Steve N.',
    'Jamie: Steve, quick question — what would change in your routine if Rocky was fully obedient in the first 3 months?
Steve: Mainly the runs. He has potential but doesn''t focus...
...',
    79, 5,
    '[{"name":"Discovery","score":84,"feedback":"Evaluated"},{"name":"Problem Agitation","score":82,"feedback":"Evaluated"},{"name":"Offer Presentation","score":80,"feedback":"Evaluated"},{"name":"Objection Handling","score":74,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":78,"feedback":"Evaluated"}]'::jsonb,
    'Shorter call than ideal. Jamie closed but left money on the table — Steve could have bought a more complete plan with more agitation.',
    ARRAY['Consistent close even in a shorter call','Direct and no-nonsense tone, appropriate for the prospect''s profile'],
    ARRAY['Problem agitation too fast — didn''t explore the emotional costs of the problem'],
    'closed', 'closed', false, '2026-03-13T10:00:00Z', '2026-03-13T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000612', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Nancy W.',
    'Nancy: The investment is above what I had planned to spend...
Jamie: I understand, but our program has excellent value for money compared to...
Nancy: Sure, but I don''t have that amount available right now...
...',
    75, 5,
    '[{"name":"Discovery","score":85,"feedback":"Evaluated"},{"name":"Problem Agitation","score":80,"feedback":"Evaluated"},{"name":"Offer Presentation","score":78,"feedback":"Evaluated"},{"name":"Objection Handling","score":62,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":70,"feedback":"Evaluated"}]'::jsonb,
    'Discovery and agitation well done, but Jamie couldn''t overcome the price objection effectively. Nancy left without buying and without a clear next step.',
    ARRAY['Good rapport built in the opening phase','Discovery correctly identified the real pain'],
    ARRAY['Response to price objection was defensive — went into justification mode instead of reframing','No next step defined — call ended without commitment'],
    'no_decision', 'no_decision', false, '2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z'
  ),
  -- Jordan K. (5 calls)
  (
    '00000000-0000-0000-0000-000000000613', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Peter G.',
    'Jordan: Peter, tell me what''s going on with Gobi.
Peter: He''s super hyper. Jumps on everyone, can''t stay still.
Jordan: Got it. So what we offer is an 8-week program...
...',
    81, 5,
    '[{"name":"Discovery","score":82,"feedback":"Evaluated"},{"name":"Problem Agitation","score":65,"feedback":"Evaluated"},{"name":"Offer Presentation","score":83,"feedback":"Evaluated"},{"name":"Objection Handling","score":70,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":68,"feedback":"Evaluated"}]'::jsonb,
    'Reasonable discovery. Jordan identified the problem but moved too quickly to the offer presentation. Problem agitation was superficial.',
    ARRAY['Offer presentation clear and well-structured','Confident tone throughout the call'],
    ARRAY['Jumped from discovery directly to the offer without adequately agitating the problem','Follow-up was vague — "I''ll send you the material" with no date'],
    'follow_up', 'follow_up', false, '2026-03-22T10:00:00Z', '2026-03-22T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000614', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Donna F.',
    'Jordan: Donna, I''ll be straight — if you sign up today, I can apply a 10% discount...
Donna: Oh, that works better for me...
...',
    75, 5,
    '[{"name":"Discovery","score":80,"feedback":"Evaluated"},{"name":"Problem Agitation","score":62,"feedback":"Evaluated"},{"name":"Offer Presentation","score":81,"feedback":"Evaluated"},{"name":"Objection Handling","score":66,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":65,"feedback":"Evaluated"}]'::jsonb,
    'Closed but with an unnecessary discount. Jordan didn''t create enough value in the agitation phase and caved on price before exploring other objections.',
    ARRAY['Persisted through to close despite objection','Knows the product well and presented it clearly'],
    ARRAY['Gave a discount without trying to resolve the objection in other ways','Problem agitation too weak — Donna wasn''t sufficiently committed'],
    'closed', 'closed', false, '2026-03-19T10:00:00Z', '2026-03-19T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000615', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Mark T.',
    'Jordan: Mark, great to meet you. So you''re interested in training for Rocky, right?
Mark: Yeah, saw it on Google...
Jordan: Great! Let me tell you about our program...
...',
    73, 5,
    '[{"name":"Discovery","score":78,"feedback":"Evaluated"},{"name":"Problem Agitation","score":60,"feedback":"Evaluated"},{"name":"Offer Presentation","score":79,"feedback":"Evaluated"},{"name":"Objection Handling","score":63,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":62,"feedback":"Evaluated"}]'::jsonb,
    'Call with a good start but lost the thread halfway. Jordan moved to the offer too early and couldn''t regain the prospect''s engagement.',
    ARRAY['Good call opening, created a positive initial atmosphere'],
    ARRAY['Presented the offer at minute 10 — too early, before the problem was well established','Didn''t try to recover when sensing the prospect was disengaged'],
    'no_decision', 'no_decision', false, '2026-03-16T10:00:00Z', '2026-03-16T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000616', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Susan B.',
    'Jordan: Susan, what''s Coco''s issue?
Susan: Oh, he''s kind of hyper...
Jordan: Got it. Want me to send you more info about the program?
...',
    70, 5,
    '[{"name":"Discovery","score":76,"feedback":"Evaluated"},{"name":"Problem Agitation","score":58,"feedback":"Evaluated"},{"name":"Offer Presentation","score":78,"feedback":"Evaluated"},{"name":"Objection Handling","score":62,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":60,"feedback":"Evaluated"}]'::jsonb,
    'Weak call. Jordan managed to present the product but without creating the urgency context needed for the close.',
    ARRAY['Solid product knowledge'],
    ARRAY['Very shallow discovery — only 2 questions before moving to the offer','Problem agitation practically non-existent','Follow-up scheduled but with no real qualification of interest'],
    'follow_up', 'follow_up', false, '2026-03-13T10:00:00Z', '2026-03-13T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000617', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'James R.',
    'Jordan: James, tell me about Brutus.
James: He''s just too big for us to control...
Jordan: Got it. Our program fixes that. The investment is X...
James: Hmm, let me think...
...',
    65, 5,
    '[{"name":"Discovery","score":68,"feedback":"Evaluated"},{"name":"Problem Agitation","score":55,"feedback":"Evaluated"},{"name":"Offer Presentation","score":72,"feedback":"Evaluated"},{"name":"Objection Handling","score":60,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":58,"feedback":"Evaluated"}]'::jsonb,
    'Very short and shallow call. Jordan couldn''t deepen the conversation enough to create value.',
    ARRAY['At least the call happened — Jordan needed more discovery practice'],
    ARRAY['Call ended too early — James needed more time to build trust','No real attempt at problem agitation','Premature close without a value foundation'],
    'no_decision', 'no_decision', false, '2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z'
  ),
  -- Taylor M. (4 calls)
  (
    '00000000-0000-0000-0000-000000000618', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Helen K.',
    'Taylor: Helen, which command specifically is Ziggy having trouble with? Stay, sit, or is it more aggression?
Helen: He''s very reactive to other dogs on walks...
Taylor: I see. Reactivity is one of our specialties...
...',
    74, 5,
    '[{"name":"Discovery","score":70,"feedback":"Evaluated"},{"name":"Problem Agitation","score":60,"feedback":"Evaluated"},{"name":"Offer Presentation","score":74,"feedback":"Evaluated"},{"name":"Objection Handling","score":58,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":65,"feedback":"Evaluated"}]'::jsonb,
    'Taylor showed product knowledge but struggled to connect the product to Helen''s real pain. The call was too technical and not emotional enough.',
    ARRAY['Knows the program specs and differentiators well'],
    ARRAY['Discovery too technical — focused on dog behaviors, not on the impact to the owner''s life','When Helen hesitated, Taylor pulled back instead of advancing with empathy'],
    'no_decision', 'no_decision', false, '2026-03-20T10:00:00Z', '2026-03-20T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000619', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Paul M.',
    'Paul: It''s expensive for what it is...
Taylor: I understand the price might seem high, but if you break it down by week...
Paul: Hmm...
Taylor: I can also explain what''s included...
...',
    71, 5,
    '[{"name":"Discovery","score":68,"feedback":"Evaluated"},{"name":"Problem Agitation","score":58,"feedback":"Evaluated"},{"name":"Offer Presentation","score":72,"feedback":"Evaluated"},{"name":"Objection Handling","score":55,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":62,"feedback":"Evaluated"}]'::jsonb,
    'Second consecutive call without closing. Taylor is clearly struggling in the objection stage — goes defensive instead of keeping focus on value.',
    ARRAY['Structured and complete program presentation'],
    ARRAY['Price objection: immediately went into justification mode','Problem agitation too quick — Paul didn''t feel real urgency','Didn''t try to involve the prospect in the solution during the call'],
    'no_decision', 'no_decision', false, '2026-03-17T10:00:00Z', '2026-03-17T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000620', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Alice N.',
    'Taylor: Alice, what motivated you to look into dog training?
Alice: Mel has been chewing things around the house a bit...
Taylor: Got it. Let me send you the program info via WhatsApp?
...',
    68, 5,
    '[{"name":"Discovery","score":65,"feedback":"Evaluated"},{"name":"Problem Agitation","score":57,"feedback":"Evaluated"},{"name":"Offer Presentation","score":71,"feedback":"Evaluated"},{"name":"Objection Handling","score":53,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":61,"feedback":"Evaluated"}]'::jsonb,
    'Very short call. Taylor seems to be feeling insecure — discovery questions were timid and the offer presentation was too rushed.',
    ARRAY['Scheduled a follow-up — at least didn''t leave without a next step'],
    ARRAY['Discovery with only 2 questions before moving to the offer','Insecure tone in the presentation — Alice probably didn''t perceive the real value','Call ended without Taylor knowing the real reason for the hesitation'],
    'follow_up', 'follow_up', false, '2026-03-14T10:00:00Z', '2026-03-14T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000621', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'George T.',
    'George: How much does it cost?
Taylor: The investment is... it depends on the plan. Options start at...
George: Yeah, but what''s the most basic one?
Taylor: The basic includes...
George: Hmm, let me think...
Taylor: Of course, no problem...
...',
    65, 5,
    '[{"name":"Discovery","score":63,"feedback":"Evaluated"},{"name":"Problem Agitation","score":55,"feedback":"Evaluated"},{"name":"Offer Presentation","score":70,"feedback":"Evaluated"},{"name":"Objection Handling","score":52,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":60,"feedback":"Evaluated"}]'::jsonb,
    'Concerning call. Taylor is showing clear signs of low confidence. Voice was hesitant and he let the prospect lead the entire conversation.',
    ARRAY['Managed to keep George on the call for 25 minutes'],
    ARRAY['Let the prospect drive the call — lost control of the conversation','Made no real attempt to close','Ended the call with "let me think about what you said" — passive position'],
    'no_decision', 'no_decision', false, '2026-03-11T10:00:00Z', '2026-03-11T10:00:00Z'
  )
ON CONFLICT (id) DO UPDATE SET
  org_id           = EXCLUDED.org_id,
  trainer_id       = EXCLUDED.trainer_id,
  overall_score    = EXCLUDED.overall_score,
  call_outcome     = EXCLUDED.call_outcome,
  detected_outcome = EXCLUDED.detected_outcome,
  updated_at       = now();

-- ─── 6. Insights ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.insights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('risk', 'warning', 'tip', 'positive')),
  icon       TEXT,
  title      TEXT NOT NULL,
  tag        TEXT,
  tag_color  TEXT DEFAULT 'blue',
  summary    TEXT,
  action     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insights_service_role_all" ON public.insights
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

INSERT INTO public.insights (id, org_id, type, icon, title, tag, tag_color, summary, action)
VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000100',
    'risk', '🚨',
    'Objection Handling is the biggest revenue leak',
    'Team pattern', 'red',
    '3 of 4 trainers score below 70 on Objection Handling. Calls that skip this step close at 38% vs. 71% when executed correctly.',
    'Schedule a 30-min role-play focused on price objections. Use Marcus''s calls as the benchmark.'
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000100',
    'warning', '⚠️',
    'Taylor is at risk of disengagement',
    'Trainer alert', 'amber',
    'Score dropped 12pts in 2 weeks, call volume down 40%, and close rate is the lowest at 55%. This is a coaching emergency, not a performance issue.',
    'Schedule a 1:1 with Taylor. Review the last 3 calls and identify where confidence dropped.'
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000100',
    'tip', '💡',
    'Marcus''s Discovery can elevate the whole team',
    'Best practices', 'blue',
    'Marcus scores 94 in Discovery — 11pts above average. He asks 3 open-ended questions before presenting the offer. No other trainer replicates this.',
    'Pull 2 clips from Marcus''s calls and share as training material at the next team meeting.'
  ),
  (
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000100',
    'positive', '📈',
    'Coaching working — close rate +7pts in 6 weeks',
    'ROI signal', 'green',
    'Since starting AI coaching, close rate went from 57% → 64%. Biggest gain in Offer Presentation (+12pts team average).',
    'Keep the cadence. Consider daily uploads for faster feedback loops.'
  )
ON CONFLICT (id) DO UPDATE SET
  org_id    = EXCLUDED.org_id,
  title     = EXCLUDED.title,
  summary   = EXCLUDED.summary,
  action    = EXCLUDED.action;

-- ─── 7. Clients (visão admin — empresas clientes do SaaS) ────────────────────

CREATE TABLE IF NOT EXISTS public.clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  plan              TEXT NOT NULL CHECK (plan IN ('Starter', 'Pro', 'Pro+RAG')),
  calls_this_month  INT DEFAULT 0,
  avg_score         INT DEFAULT 0,
  mrr               NUMERIC DEFAULT 0,
  health            TEXT NOT NULL CHECK (health IN ('healthy', 'at-risk', 'churning')),
  trainers_count    INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (admin) acessa clients
CREATE POLICY "clients_service_role_all" ON public.clients
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.clients (id, name, plan, calls_this_month, avg_score, mrr, health, trainers_count)
VALUES
  ('00000000-0000-0000-0000-000000000401', 'Paw Masters Academy',  'Pro',     83, 83, 497,  'healthy', 4),
  ('00000000-0000-0000-0000-000000000402', 'Elite K9 Training',    'Starter', 94, 76, 297,  'at-risk', 6),
  ('00000000-0000-0000-0000-000000000403', 'Dog Whisperers Co.',   'Pro+RAG', 70, 88, 697,  'healthy', 3)
ON CONFLICT (id) DO UPDATE SET
  plan             = EXCLUDED.plan,
  calls_this_month = EXCLUDED.calls_this_month,
  avg_score        = EXCLUDED.avg_score,
  mrr              = EXCLUDED.mrr,
  health           = EXCLUDED.health,
  trainers_count   = EXCLUDED.trainers_count;

-- ─── 8. Vincular calls existentes (uploaded via dashboard) ao org de demo ────
-- Calls inseridas antes desta migration não têm org_id — vincular à org de demo.

UPDATE public.calls
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- ─── 9. Vincular rubrics e criteria sem org_id à org de demo ─────────────────

UPDATE public.rubrics
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

UPDATE public.criteria
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- ─── 10. Vincular scripts sem org_id à org de demo ───────────────────────────

UPDATE public.scripts
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;
