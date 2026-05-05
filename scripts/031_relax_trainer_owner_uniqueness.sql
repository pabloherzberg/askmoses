-- ============================================================
-- 031_relax_trainer_owner_uniqueness.sql
-- Permite multi-org em trainers e owners.
--
-- - trainers: já tinha org_id (015). UNIQUE(user_id) → UNIQUE(user_id, org_id).
-- - owners: NÃO tinha org_id. Adicionar coluna + backfill via users.org_id.
--   UNIQUE(user_id) → UNIQUE(user_id, org_id).
--
-- Idempotente — checks de pg_constraint antes de DROP/ADD.
-- ============================================================

-- ─── 1. trainers: UNIQUE(user_id) → UNIQUE(user_id, org_id) ──────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_id_key') THEN
    ALTER TABLE public.trainers DROP CONSTRAINT trainers_user_id_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_org_key') THEN
    ALTER TABLE public.trainers ADD CONSTRAINT trainers_user_org_key UNIQUE (user_id, org_id);
  END IF;
END $$;

-- ─── 2. owners: ADD org_id + backfill ────────────────────────────────────────

ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS owners_org_id_idx ON public.owners(org_id);

-- Backfill via users.org_id (ainda presente como coluna denormalizada). Cada
-- owner row hoje tem 1:1 com user → 1:1 com org, então o backfill é seguro.
UPDATE public.owners o
SET    org_id = u.org_id
FROM   public.users u
WHERE  u.id = o.user_id
  AND  o.org_id IS NULL
  AND  u.org_id IS NOT NULL;

-- ─── 3. owners: UNIQUE(user_id) → UNIQUE(user_id, org_id) ────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_user_id_key') THEN
    ALTER TABLE public.owners DROP CONSTRAINT owners_user_id_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_user_org_key') THEN
    ALTER TABLE public.owners ADD CONSTRAINT owners_user_org_key UNIQUE (user_id, org_id);
  END IF;
END $$;
