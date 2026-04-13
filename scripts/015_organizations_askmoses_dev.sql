-- ============================================================
-- 015_organizations_askmoses_dev.sql
-- Adaptado para a estrutura real do supabase-askmoses-dev.
-- Sem tabela profiles — usa owners, admins, trainers, users.
-- ============================================================

-- ─── 1. Tabela organizations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  avg_ticket NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_service_role_all" ON public.organizations
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 2. Org de demo ───────────────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, avg_ticket, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  'Dog Wizard HQ',
  1500,
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ─── 3. org_id em trainers ────────────────────────────────────────────────────

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS trainers_org_id_idx ON public.trainers(org_id);

-- ─── 4. org_id em calls ───────────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calls_org_id_idx ON public.calls(org_id);

-- Dropar policies abertas e criar isolamento por org
DROP POLICY IF EXISTS "Allow read calls" ON public.calls;
DROP POLICY IF EXISTS "Allow insert calls" ON public.calls;
DROP POLICY IF EXISTS "Allow update calls" ON public.calls;

CREATE POLICY "calls_service_role_all" ON public.calls
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 5. org_id em rubrics (coluna já existe, só adicionar FK e RLS) ───────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'rubrics_org_id_fkey'
    AND table_name = 'rubrics'
  ) THEN
    ALTER TABLE public.rubrics
      ADD CONSTRAINT rubrics_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Allow all rubrics operations" ON public.rubrics;

CREATE POLICY "rubrics_service_role_all" ON public.rubrics
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "rubrics_select_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 6. org_id em criteria ────────────────────────────────────────────────────

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Allow all criteria operations" ON public.criteria;

CREATE POLICY "criteria_service_role_all" ON public.criteria
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "criteria_select_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 7. org_id em scripts ─────────────────────────────────────────────────────

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_service_role_all" ON public.scripts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 8. Tabela insights ───────────────────────────────────────────────────────

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

-- ─── 9. Tabela clients (visão admin) ──────────────────────────────────────────

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

CREATE POLICY "clients_service_role_all" ON public.clients
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 10. Vincular dados existentes à org de demo ──────────────────────────────

-- Rubric existente
UPDATE public.rubrics
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- Criteria existentes
UPDATE public.criteria
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- Calls existentes
UPDATE public.calls
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- Scripts existentes
UPDATE public.scripts
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;
