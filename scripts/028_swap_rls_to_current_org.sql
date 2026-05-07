-- ============================================================
-- 028_swap_rls_to_current_org.sql
-- Swap das policies multi-tenant: deixa de ler
--   auth.jwt()->'app_metadata'->>'org_id'
-- e passa a chamar public.current_org() (definida em 027).
--
-- Adicionalmente, reforça current_org() pra exigir membership
-- ativa — assim, se alguém setar users.active_org_id pra uma org
-- que ele não pertence, current_org() devolve NULL e nenhuma RLS
-- libera linha (defesa em profundidade).
--
-- Tabelas tocadas: organizations, calls, rubrics, criteria,
-- scripts, insights. profiles/owners/clients usam outras políticas
-- (auth.uid = id, service_role only) e ficam intocados.
--
-- DROP IF EXISTS cobre os 2 nomes históricos (012 vs 015) — alguns
-- ambientes podem ter aplicado um dos dois. Idempotente.
-- ============================================================

-- ─── 1. current_org() endurecida — exige membership ativa ────────────────────

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.active_org_id
  FROM   public.users u
  WHERE  u.id = auth.uid()
    AND  EXISTS (
      SELECT 1
      FROM   public.memberships m
      WHERE  m.user_id       = u.id
        AND  m.org_id        = u.active_org_id
        AND  m.invite_status = 'accepted'
    )
$$;

-- ─── 2. organizations ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = public.current_org());

-- ─── 3. calls ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "calls_select_by_org" ON public.calls;
CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_insert_by_org" ON public.calls;
CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_update_by_org" ON public.calls;
CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING (org_id = public.current_org());

-- ─── 4. rubrics ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rubrics_isolate_by_org" ON public.rubrics; -- 012 naming
DROP POLICY IF EXISTS "rubrics_select_by_org"  ON public.rubrics; -- 015 naming
CREATE POLICY "rubrics_select_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "rubrics_write_by_org" ON public.rubrics;
CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 5. criteria ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "criteria_isolate_by_org" ON public.criteria; -- 012 naming
DROP POLICY IF EXISTS "criteria_select_by_org"  ON public.criteria; -- 015 naming
CREATE POLICY "criteria_select_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "criteria_write_by_org" ON public.criteria;
CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 6. scripts ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "scripts_select_by_org" ON public.scripts;
CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "scripts_write_by_org" ON public.scripts;
CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 7. insights ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "insights_select_by_org" ON public.insights;
CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = public.current_org());
