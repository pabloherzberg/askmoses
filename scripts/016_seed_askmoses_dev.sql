-- ============================================================
-- 016_seed_askmoses_dev.sql
-- Seed de dados de demo para askmoses-dev.
-- Trainers e calls já existem — atualiza com org_id e stats.
-- ============================================================

-- ─── 1. Update trainers com org_id e stats de demo ───────────────────────────

UPDATE public.trainers SET
  org_id = '00000000-0000-0000-0000-000000000100',
  total_calls = 47, close_rate = 68, close_delta = 5,
  score = 91, score_delta = 3, last_active = '2026-04-10T00:00:00Z',
  score_discovery = 94, score_problem_agitation = 89,
  score_offer_presentation = 92, score_objection_handling = 88,
  score_close_next_steps = 90
WHERE id = '769f74dd-3637-42f1-bede-73799321f5c7';

UPDATE public.trainers SET
  org_id = '00000000-0000-0000-0000-000000000100',
  total_calls = 39, close_rate = 61, close_delta = 2,
  score = 87, score_delta = 1, last_active = '2026-04-11T00:00:00Z',
  score_discovery = 85, score_problem_agitation = 88,
  score_offer_presentation = 86, score_objection_handling = 84,
  score_close_next_steps = 92
WHERE id = '1eeeedcc-fc4c-463c-958e-1e5442b96c64';

UPDATE public.trainers SET
  org_id = '00000000-0000-0000-0000-000000000100',
  total_calls = 31, close_rate = 52, close_delta = -3,
  score = 79, score_delta = -2, last_active = '2026-04-09T00:00:00Z',
  score_discovery = 78, score_problem_agitation = 75,
  score_offer_presentation = 82, score_objection_handling = 76,
  score_close_next_steps = 83
WHERE id = '48e8cd89-3482-469a-8355-873afb693b6b';

UPDATE public.trainers SET
  org_id = '00000000-0000-0000-0000-000000000100',
  total_calls = 28, close_rate = 43, close_delta = -7,
  score = 74, score_delta = -5, last_active = '2026-04-08T00:00:00Z',
  score_discovery = 70, score_problem_agitation = 68,
  score_offer_presentation = 78, score_objection_handling = 65,
  score_close_next_steps = 80
WHERE id = '3d58f0b1-d379-4657-85d4-c368666b1f37';

-- ─── 2. Update calls existentes com org_id ───────────────────────────────────

UPDATE public.calls
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- ─── 3. Adicionar calls extras ───────────────────────────────────────────────

INSERT INTO public.calls (
  id, rubric_id, trainer_id, org_id,
  trainer_name, trainer_email, client_name,
  overall_score, total_criteria, criteria,
  call_outcome, detected_outcome,
  transcript, summary, strengths, improvements,
  created_at
) VALUES
  ('00000000-0000-0000-0000-000000000601',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '769f74dd-3637-42f1-bede-73799321f5c7',
   '00000000-0000-0000-0000-000000000100',
   'Marcus R.', 'trainer@demo.askmoses.ai', 'Bella''s Family',
   94, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Excellent discovery phase, strong close technique.',
   ARRAY['Strong rapport building','Clear value proposition','Handled price objection well'],
   ARRAY['Could dig deeper into lifestyle impact'],
   '2026-04-10T10:00:00Z'),

  ('00000000-0000-0000-0000-000000000602',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '769f74dd-3637-42f1-bede-73799321f5c7',
   '00000000-0000-0000-0000-000000000100',
   'Marcus R.', 'trainer@demo.askmoses.ai', 'Cooper''s Owner',
   91, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Great problem agitation, client was highly motivated.',
   ARRAY['Identified pain points clearly','Used urgency effectively','Smooth transition to offer'],
   ARRAY['Next steps could be more specific'],
   '2026-04-08T14:00:00Z'),

  ('00000000-0000-0000-0000-000000000603',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '769f74dd-3637-42f1-bede-73799321f5c7',
   '00000000-0000-0000-0000-000000000100',
   'Marcus R.', 'trainer@demo.askmoses.ai', 'Luna''s Household',
   92, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Exceptional session — client signed same day.',
   ARRAY['Outstanding objection handling','High emotional connection','Closed on first call'],
   ARRAY['Nothing significant'],
   '2026-04-02T09:00:00Z'),

  ('00000000-0000-0000-0000-000000000606',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '1eeeedcc-fc4c-463c-958e-1e5442b96c64',
   '00000000-0000-0000-0000-000000000100',
   'Jamie L.', 'trainer2@demo.askmoses.ai', 'Daisy''s Mom',
   90, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Very strong close sequence, excellent rapport.',
   ARRAY['Built immediate trust','Tailored offer to budget','Clean close'],
   ARRAY['Discovery phase felt rushed'],
   '2026-04-11T09:00:00Z'),

  ('00000000-0000-0000-0000-000000000607',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '1eeeedcc-fc4c-463c-958e-1e5442b96c64',
   '00000000-0000-0000-0000-000000000100',
   'Jamie L.', 'trainer2@demo.askmoses.ai', 'Zoe''s Owner',
   83, 5, '[]'::jsonb,
   'not_closed', 'objection_unresolved',
   '[Demo] Transcript de demonstração.',
   'Client needed more time, deal lost to competitor.',
   ARRAY['Good problem agitation','Identified pain clearly'],
   ARRAY['Did not create enough urgency','Follow-up too slow'],
   '2026-04-01T16:00:00Z'),

  ('00000000-0000-0000-0000-000000000611',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '48e8cd89-3482-469a-8355-873afb693b6b',
   '00000000-0000-0000-0000-000000000100',
   'Jordan K.', 'trainer3@demo.askmoses.ai', 'Pepper''s Owner',
   81, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Decent call, closed but left some value on table.',
   ARRAY['Friendly tone','Good initial discovery'],
   ARRAY['Did not fully agitate the problem','Close was hesitant'],
   '2026-04-09T10:00:00Z'),

  ('00000000-0000-0000-0000-000000000612',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '48e8cd89-3482-469a-8355-873afb693b6b',
   '00000000-0000-0000-0000-000000000100',
   'Jordan K.', 'trainer3@demo.askmoses.ai', 'Sadie''s Family',
   76, 5, '[]'::jsonb,
   'not_closed', 'objection_unresolved',
   '[Demo] Transcript de demonstração.',
   'Client objected to price and Jordan could not recover.',
   ARRAY['Good opening','Showed genuine interest'],
   ARRAY['Weak objection handling','No urgency created','Lost on price'],
   '2026-04-06T14:00:00Z'),

  ('00000000-0000-0000-0000-000000000615',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '48e8cd89-3482-469a-8355-873afb693b6b',
   '00000000-0000-0000-0000-000000000100',
   'Jordan K.', 'trainer3@demo.askmoses.ai', 'Molly''s Family',
   77, 5, '[]'::jsonb,
   'not_closed', 'objection_unresolved',
   '[Demo] Transcript de demonstração.',
   'Second consecutive loss — coaching needed on closing.',
   ARRAY['Client was engaged throughout'],
   ARRAY['Could not handle spouse objection','Close sequence weak'],
   '2026-03-27T15:00:00Z'),

  ('00000000-0000-0000-0000-000000000616',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '3d58f0b1-d379-4657-85d4-c368666b1f37',
   '00000000-0000-0000-0000-000000000100',
   'Taylor M.', 'trainer4@demo.askmoses.ai', 'Biscuit''s Owner',
   72, 5, '[]'::jsonb,
   'not_closed', 'objection_unresolved',
   '[Demo] Transcript de demonstração.',
   'Struggled with objection handling throughout.',
   ARRAY['Friendly and approachable','Good opening question'],
   ARRAY['Weak problem agitation','Could not handle price objection','No clear close attempt'],
   '2026-04-08T10:00:00Z'),

  ('00000000-0000-0000-0000-000000000617',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '3d58f0b1-d379-4657-85d4-c368666b1f37',
   '00000000-0000-0000-0000-000000000100',
   'Taylor M.', 'trainer4@demo.askmoses.ai', 'Shadow''s Family',
   75, 5, '[]'::jsonb,
   'closed', 'closed',
   '[Demo] Transcript de demonstração.',
   'Closed but at discount — margin lost.',
   ARRAY['Persistent','Built some urgency'],
   ARRAY['Discounted without pushback','Offer presentation weak'],
   '2026-04-05T14:00:00Z'),

  ('00000000-0000-0000-0000-000000000620',
   '2abbfee3-117f-4b9c-b484-3bf7ac154ef2',
   '3d58f0b1-d379-4657-85d4-c368666b1f37',
   '00000000-0000-0000-0000-000000000100',
   'Taylor M.', 'trainer4@demo.askmoses.ai', 'Rosie''s Family',
   73, 5, '[]'::jsonb,
   'not_closed', 'objection_unresolved',
   '[Demo] Transcript de demonstração.',
   'Third loss in recent stretch — intervention needed.',
   ARRAY['Polite throughout'],
   ARRAY['Problem agitation missing entirely','Offer presented too early','No urgency'],
   '2026-03-25T15:00:00Z')

ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  trainer_id = EXCLUDED.trainer_id,
  trainer_name = EXCLUDED.trainer_name,
  trainer_email = EXCLUDED.trainer_email,
  client_name = EXCLUDED.client_name,
  overall_score = EXCLUDED.overall_score,
  total_criteria = EXCLUDED.total_criteria,
  criteria = EXCLUDED.criteria,
  call_outcome = EXCLUDED.call_outcome,
  detected_outcome = EXCLUDED.detected_outcome,
  summary = EXCLUDED.summary,
  strengths = EXCLUDED.strengths,
  improvements = EXCLUDED.improvements;

-- ─── 4. Insights ─────────────────────────────────────────────────────────────

INSERT INTO public.insights (id, org_id, type, icon, title, tag, tag_color, summary, action, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000701',
   '00000000-0000-0000-0000-000000000100',
   'risk', '🔴', 'Taylor M. losing 3 of last 5 calls',
   'Close Rate', 'red',
   'Taylor''s close rate dropped 7pp in 2 weeks. Pattern shows failure at objection handling phase.',
   'Schedule coaching session focused on objection handling scripts.',
   '2026-04-12T00:00:00Z'),

  ('00000000-0000-0000-0000-000000000702',
   '00000000-0000-0000-0000-000000000100',
   'warning', '🟡', 'Jordan K. showing downward trend',
   'Score Trend', 'amber',
   'Jordan''s score dropped 2pp and close rate fell 3pp. Two consecutive losses in price objection scenarios.',
   'Review objection handling technique and practice price anchoring.',
   '2026-04-12T00:00:00Z'),

  ('00000000-0000-0000-0000-000000000703',
   '00000000-0000-0000-0000-000000000100',
   'positive', '🟢', 'Marcus R. closed 4 of 5 recent calls',
   'Top Performer', 'green',
   'Marcus achieved 94 avg score this month. His objection handling technique is standout.',
   'Record Marcus''s objection handling for team training library.',
   '2026-04-12T00:00:00Z'),

  ('00000000-0000-0000-0000-000000000704',
   '00000000-0000-0000-0000-000000000100',
   'tip', '💡', 'Discovery phase scores below 80 correlate with lost deals',
   'Coaching Insight', 'blue',
   'Analysis of 20 calls shows that when discovery score < 80, close rate drops by 40%.',
   'Run discovery-focused role play in next team meeting.',
   '2026-04-12T00:00:00Z')

ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  action = EXCLUDED.action;

-- ─── 5. Clients (visão admin) ─────────────────────────────────────────────────

INSERT INTO public.clients (id, name, plan, calls_this_month, avg_score, mrr, health, trainers_count, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000801',
   'Dog Wizard HQ', 'Pro', 20, 83, 1500, 'healthy', 4, '2026-01-15T00:00:00Z'),

  ('00000000-0000-0000-0000-000000000802',
   'Paw Academy', 'Starter', 8, 71, 500, 'at-risk', 2, '2026-02-01T00:00:00Z'),

  ('00000000-0000-0000-0000-000000000803',
   'K9 Elite Training', 'Pro+RAG', 35, 88, 2500, 'healthy', 6, '2025-11-20T00:00:00Z')

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  calls_this_month = EXCLUDED.calls_this_month,
  avg_score = EXCLUDED.avg_score,
  mrr = EXCLUDED.mrr,
  health = EXCLUDED.health,
  trainers_count = EXCLUDED.trainers_count;

-- ─── 6. Atualizar JWT app_metadata para todos os usuários de demo ─────────────

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"owner","org_id":"00000000-0000-0000-0000-000000000100"}'::jsonb
WHERE id = '4f8093ea-e921-40ee-a635-7e709b897a03';

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"trainer","org_id":"00000000-0000-0000-0000-000000000100"}'::jsonb
WHERE id IN (
  'f2b000e9-8f80-4170-a971-d840a0518985',
  '35fa4c87-ae4b-46fa-93d0-490817541df6',
  '7ef94f2c-9f62-48d2-8202-1bb70b9d2bc5',
  '88fed194-d90e-48a2-b832-6a529a396153'
);

UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin","org_id":"00000000-0000-0000-0000-000000000100"}'::jsonb
WHERE id = '7981ea6e-429c-442f-8905-a7772cf0666d';
