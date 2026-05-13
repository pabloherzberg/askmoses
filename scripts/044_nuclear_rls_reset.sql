-- ============================================================
-- 044_nuclear_rls_reset.sql
-- Reset definitivo das funções e policies que estavam em ciclo.
--
-- 042 e 043 quebraram os ciclos conhecidos mas o erro persiste. Hipóteses:
--   (a) migrations não aplicaram 100% (erro silencioso no Studio)
--   (b) algum plano cacheado pela engine referencia versão antiga
--   (c) policy ou função em estado intermediário
--
-- Esta migration força o estado final limpo via DROP + RECREATE.
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- ============================================================

-- ─── 1. Dropa todas as policies de users (vai recriar só as necessárias) ─────

DROP POLICY IF EXISTS "users_service_role_all" ON public.users;
DROP POLICY IF EXISTS "users_select_self"      ON public.users;
DROP POLICY IF EXISTS "users_select_same_org"  ON public.users;

-- ─── 2. Dropa as funções (vai recriar com bodies simplificadas) ──────────────

DROP FUNCTION IF EXISTS public.current_org()           CASCADE;
DROP FUNCTION IF EXISTS public.current_org_for_write() CASCADE;
-- CASCADE necessário pq as policies que usam essas funções estão pendentes.
-- Vamos recriar policy por policy depois.

-- ─── 3. Recria as funções LIMPAS (zero cross-table refs além de users) ──────

CREATE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
     AND (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id') IS NOT NULL
    THEN (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id')::uuid
    ELSE (
      SELECT u.active_org_id
      FROM public.users u
      WHERE u.id = auth.uid()
    )
  END
$$;

CREATE FUNCTION public.current_org_for_write()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.active_org_id
  FROM public.users u
  WHERE u.id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_org()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_org_for_write() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_org()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.current_org_for_write() TO authenticated, service_role;

-- ─── 4. Recria policies de users — APENAS as duas seguras ───────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- ─── 5. Recria policies dependentes (CASCADE acima dropou) ──────────────────

-- organizations
DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = public.current_org());

-- calls
DROP POLICY IF EXISTS "calls_select_by_org" ON public.calls;
CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_insert_by_org" ON public.calls;
CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "calls_update_by_org" ON public.calls;
CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "calls_delete_by_org" ON public.calls;
CREATE POLICY "calls_delete_by_org" ON public.calls
  FOR DELETE
  USING (org_id = public.current_org_for_write());

-- rubrics
DROP POLICY IF EXISTS "rubrics_select_by_org" ON public.rubrics;
CREATE POLICY "rubrics_select_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "rubrics_write_by_org" ON public.rubrics;
CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- criteria
DROP POLICY IF EXISTS "criteria_select_by_org" ON public.criteria;
CREATE POLICY "criteria_select_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "criteria_write_by_org" ON public.criteria;
CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- scripts
DROP POLICY IF EXISTS "scripts_select_by_org" ON public.scripts;
CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "scripts_write_by_org" ON public.scripts;
CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- insights
DROP POLICY IF EXISTS "insights_select_by_org" ON public.insights;
CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "insights_write_by_org" ON public.insights;
CREATE POLICY "insights_write_by_org" ON public.insights
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- marketing_runs
DROP POLICY IF EXISTS "marketing_runs_select_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_select_by_org" ON public.marketing_runs
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

-- trainers
DROP POLICY IF EXISTS "trainers_select_by_org" ON public.trainers;
CREATE POLICY "trainers_select_by_org" ON public.trainers
  FOR SELECT
  USING (org_id = public.current_org());

-- memberships — mantém select_own; descarta select_by_org pra cortar
-- qualquer chance residual de ciclo. Owner listando time já usa
-- service_role no app, então sem regressão funcional.
DROP POLICY IF EXISTS "memberships_select_by_org" ON public.memberships;

-- ─── 6. Sanity: lista o que ficou ────────────────────────────────────────────
-- Roda esses SELECT no fim — todos os policies usando current_org() devem
-- aparecer, e current_org() body NÃO deve mencionar memberships.

SELECT 'policy' AS kind, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'memberships', 'calls', 'rubrics', 'trainers')
ORDER BY tablename, policyname;

SELECT 'function' AS kind, proname, pg_get_functiondef(oid) AS definition
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('current_org', 'current_org_for_write');
