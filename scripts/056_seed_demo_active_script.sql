-- ============================================================
-- 056_seed_demo_active_script.sql
-- Insere o script ativo da Dog Wizard HQ com as 5 seções
-- da rubrica padrão de adestramento, para uso na tela de
-- Script Intelligence (/dashboard/insights).
-- ============================================================

-- IDs de referência:
-- org:    00000000-0000-0000-0000-000000000100  → Dog Wizard HQ
-- rubric: b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d  → Dog Training Sales Rubric
-- script: 00000000-0000-0000-0000-000000000701  → Discovery-First Sales Script v2

-- Desativar qualquer script ativo existente da org antes de inserir o novo
UPDATE public.scripts
SET is_active = false
WHERE org_id = '00000000-0000-0000-0000-000000000100'
  AND is_active = true;

INSERT INTO public.scripts (
  id,
  org_id,
  rubric_id,
  name,
  description,
  sections,
  full_script,
  criteria,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000100',
  'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
  'Discovery-First Sales Script',
  'Discovery-first script — deep discovery before presenting the offer. Currently the active team script.',
  jsonb_build_array(
    jsonb_build_object(
      'name',         'Discovery',
      'instructions', 'Start by taking control of the conversation. Introduce yourself and state the purpose of the call. Ask at least 3 open-ended questions before presenting anything: "What is going on with [dog name] that brought you to us today?", "How long has this been happening?", "How does this affect your daily life?". Do not mention the offer until the prospect has described the problem in their own words.',
      'tips',         'Use the prospect''s dog name throughout. Take notes on specific words they use to describe the problem — mirror them back later. Silence after a question is your friend.',
      'weight',       30,
      'critical',     true
    ),
    jsonb_build_object(
      'name',         'Problem Agitation',
      'instructions', 'After discovery, deepen the emotional impact of the problem. Ask: "How does it make you feel when this happens?", "Has this affected your relationship with your dog?", "What have you tried before?". Connect the problem to real costs — financial, emotional, relational. Make the prospect feel the urgency of solving it now, not later.',
      'tips',         'Do not rush this phase. The close rate is directly tied to how well you agitate here. A prospect who feels the pain deeply will overcome their own objections.',
      'weight',       25,
      'critical',     true
    ),
    jsonb_build_object(
      'name',         'Offer Presentation',
      'instructions', 'Only present the offer after the prospect has clearly expressed their pain. Present the program as the specific solution to what they described: "Based on everything you told me about [problem], here is exactly what we do...". Present value first, price last. Use concrete outcomes: "By session 3, most owners see X. By the end of the program, your dog will Y."',
      'tips',         'Never present the price before the value. If they ask for price early, redirect: "I want to make sure this is the right fit first — can I ask you a couple more questions?"',
      'weight',       20,
      'critical',     false
    ),
    jsonb_build_object(
      'name',         'Objection Handling',
      'instructions', 'Handle objections with the Feel-Felt-Found framework: "I understand how you feel. Other owners felt the same way. What they found was...". For price objections, anchor to the cost of inaction: "How much has this already cost you — in damaged furniture, vet visits, stress?". Never discount. Reframe, redirect, and hold value.',
      'tips',         'The biggest mistake is going defensive. Stay calm, stay on value. If they say "I need to think about it", ask: "What specifically would you need to think through? I want to make sure I answered everything."',
      'weight',       15,
      'critical',     false
    ),
    jsonb_build_object(
      'name',         'Close & Next Steps',
      'instructions', 'Ask for the close directly: "Based on everything we discussed, does this sound like the right solution for you and [dog name]?". If yes, confirm date, time, and deposit on the call — do not leave it open. If they need time, set a specific follow-up: "Let''s schedule a 15-min call for Thursday at 10am to answer any remaining questions." Never end a call without a defined next step.',
      'tips',         'The close is a natural result of a well-run call. If you get strong resistance here, the issue is usually in discovery or agitation — not the close itself.',
      'weight',       10,
      'critical',     false
    )
  ),
  'Start with deep discovery (3+ questions). Agitate the problem emotionally. Present the offer only after the prospect has described their pain in full. Handle objections with Feel-Felt-Found. Close directly and always define the next step before hanging up.',
  '[]'::jsonb,
  true,
  '2026-01-15T08:00:00Z',
  '2026-01-15T08:00:00Z'
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  sections    = EXCLUDED.sections,
  full_script = EXCLUDED.full_script,
  is_active   = EXCLUDED.is_active,
  updated_at  = now();

-- Garantir que o org_scripts aponte para este script como ativo
-- (usa upsert para não duplicar se já existir)
INSERT INTO public.org_scripts (
  org_id,
  script_id,
  status,
  started_at
)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000701',
  'active',
  '2026-01-15T08:00:00Z'
)
ON CONFLICT DO NOTHING;
