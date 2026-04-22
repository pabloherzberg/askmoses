-- ============================================================
-- 012_create_organizations.sql
-- Cria tabela organizations e adiciona org_id como FK em
-- profiles, rubrics, criteria, calls e scripts.
-- Configura RLS de isolamento por org em todas as tabelas.
-- ============================================================

-- ─── 1. Tabela organizations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  avg_ticket NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Admin (service_role) acessa tudo; owner acessa apenas a própria org
CREATE POLICY "orgs_service_role_all" ON public.organizations
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 2. Adicionar org_id em profiles ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles(org_id);

-- ─── 3. Adicionar org_id em rubrics ──────────────────────────────────────────

ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rubrics_org_id_idx ON public.rubrics(org_id);

-- Dropar policy aberta anterior e criar policy de isolamento
DROP POLICY IF EXISTS "Allow all rubrics operations" ON public.rubrics;

CREATE POLICY "rubrics_service_role_all" ON public.rubrics
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "rubrics_isolate_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 4. Adicionar org_id em criteria ─────────────────────────────────────────

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS criteria_org_id_idx ON public.criteria(org_id);

-- Dropar policy aberta anterior e criar policy de isolamento
DROP POLICY IF EXISTS "Allow all criteria operations" ON public.criteria;

CREATE POLICY "criteria_service_role_all" ON public.criteria
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "criteria_isolate_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 5. Adicionar org_id em calls ────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calls_org_id_idx ON public.calls(org_id);

-- Dropar policies abertas anteriores
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

-- ─── 6. Adicionar org_id em scripts ──────────────────────────────────────────

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS scripts_org_id_idx ON public.scripts(org_id);

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
