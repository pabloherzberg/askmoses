-- ============================================================
-- 021_fix_schema_gaps.sql
-- Consolida 4 gaps descobertos no setup do dev novo:
--   1. trainer_id ausente em calls       (013 inseria sem ALTER prévio)
--   2. rubric "Dog Training Sales Rubric" b4e99b19-… nunca era criada
--   3. UNIQUE em trainers.user_id ausente  (necessária pro upsert da setup-three-clients)
--   4. Tabela owners ausente              (referenciada por 020 backfill 2b e pela API)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. trainer_id em calls ──────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES public.trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calls_trainer_id_idx ON public.calls(trainer_id);

-- ─── 2. Rubric "Dog Training Sales Rubric" + 5 criteria ──────────────────────
-- Necessária pelo INSERT de calls do 013 (que tem rubric_id FK para essa).

INSERT INTO public.rubrics (id, name, description, is_active, org_id)
VALUES (
  'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
  'Dog Training Sales Rubric',
  'Rubric for evaluating dog trainer sales calls — Dog Wizard HQ',
  true,
  '00000000-0000-0000-0000-000000000100'
)
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  org_id = EXCLUDED.org_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.criteria
    WHERE rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'
  ) THEN
    INSERT INTO public.criteria (rubric_id, name, description, sort_order, org_id) VALUES
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Discovery',          'Open-ended questions and active listening before any pitch.', 1, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Problem Agitation',  'Deepen the prospect pain — emotional and financial impact.',  2, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Offer Presentation', 'Connect the offer to the identified pain.',                  3, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Objection Handling', 'Reframe objections without defensive posture.',              4, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Close & Next Steps', 'Clear commitment or next step before hanging up.',            5, '00000000-0000-0000-0000-000000000100');
  END IF;
END $$;

UPDATE public.criteria
SET    org_id = '00000000-0000-0000-0000-000000000100'
WHERE  rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'
  AND  org_id IS NULL;

-- ─── 3. UNIQUE em trainers.user_id ───────────────────────────────────────────
-- Necessária para upsert(onConflict: 'user_id') no setup-three-clients.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_id_key'
  ) THEN
    ALTER TABLE public.trainers ADD CONSTRAINT trainers_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- ─── 4. Tabela owners ────────────────────────────────────────────────────────
-- trainers.owner_id referencia owners.id (não users.id direto).
-- Usada por /api/invites e pelo setup-three-clients.

CREATE TABLE IF NOT EXISTS public.owners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  company    TEXT,
  plan       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owners_user_id_idx ON public.owners(user_id);

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owners_service_role_all' AND tablename = 'owners') THEN
    CREATE POLICY owners_service_role_all ON public.owners
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owners_select_own' AND tablename = 'owners') THEN
    CREATE POLICY owners_select_own ON public.owners
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;
