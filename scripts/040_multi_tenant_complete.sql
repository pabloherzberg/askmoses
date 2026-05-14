-- ============================================================
-- 040_multi_tenant_complete.sql
-- Consolida 040+041+042+043+044+045 (rodada de 2026-05-13) num único
-- script idempotente. Cobre tudo que a feature de multi-tenant infra +
-- Admin impersonate precisou:
--
--   1. Subscription state expandido: 'trial' + trial_ends_at + admin_override
--   2. current_org() — versão final, sem ciclo via memberships
--      - Suporta impersonate read-only via JWT app_metadata.impersonating_org_id
--      - Confia em users.active_org_id (validação no API, /api/me/active-org)
--   3. current_org_for_write() — estrita, ignora impersonate
--      - Usada em WITH CHECK / FOR INSERT|UPDATE|DELETE
--      - Garante read-only pra Admin impersonando no nível DB
--      - Caveat: lib/db/*.ts usa service_role e bypassa RLS — a defesa real
--        é requireOwnerWrite() no API. Isso aqui é defense-in-depth.
--   4. RLS habilitado em users + trainers (não tinham antes)
--   5. Policies completas em todas tabelas tenant: SELECT por org,
--      mutations bloqueadas pra impersonate
--   6. Trial 'on-read': get_user_org_context flippa pra 'inactive' quando
--      trial_ends_at passou. Cron em 046 limpa o estado físico também.
--   7. admin_impersonations table com lockdown (FORCE RLS, service_role only)
--   8. Limpeza de policies legadas "tabela: admin read all" que tinham
--      self-subquery em users — causa do erro 42P17 (infinite recursion).
--
-- Idempotente: pode rodar várias vezes, em DB virgem ou em DB que já
-- aplicou as migrations 040-045 individualmente.
-- ============================================================

-- ─── PARTE 1: Subscription state expandido ──────────────────────────────────

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'trial'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_override BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS organizations_trial_ends_at_idx
  ON public.organizations(trial_ends_at)
  WHERE subscription_status = 'trial';

COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'Quando o trial vira inactive automaticamente. get_user_org_context flippa o status on-read; cron job em 046 também limpa o estado físico. NULL = sem trial ativo.';

COMMENT ON COLUMN public.organizations.admin_override IS
  'true = Admin setou subscription_status manualmente (trial/active/inactive). Stripe webhook futuro deve respeitar e não sobrescrever.';

-- ─── PARTE 2: Limpeza de policies legadas ───────────────────────────────────
-- As policies abaixo são do setup anterior ao multi-tenant. Padrão
-- "tabela: admin read all" com USING (EXISTS SELECT 1 FROM users WHERE
-- u.role='admin') causava recursão infinita quando aplicada em users.
-- Drop antes de criar as novas pra evitar conflito de nome/comportamento.

DROP POLICY IF EXISTS "users: admin read all"    ON public.users;
DROP POLICY IF EXISTS "users: own row"           ON public.users;
DROP POLICY IF EXISTS "trainers: admin read all" ON public.trainers;
DROP POLICY IF EXISTS "owners: admin read all"   ON public.owners;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admins' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "admins: admin read all" ON public.admins;
  END IF;
END $$;

-- ─── PARTE 3: Funções current_org() — versão final ──────────────────────────
-- Drop com CASCADE pra limpar policies dependentes; recriadas na PARTE 6.
-- Função final NÃO faz EXISTS em memberships (era a fonte do ciclo).
-- Confiamos que users.active_org_id é consistente: /api/me/active-org valida
-- membership ANTES de gravar, e trigger em 046 limpa active_org_id quando
-- membership é deletada.

DROP FUNCTION IF EXISTS public.current_org()           CASCADE;
DROP FUNCTION IF EXISTS public.current_org_for_write() CASCADE;

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

COMMENT ON FUNCTION public.current_org() IS
  'Org ativa do user. Admin com app_metadata.impersonating_org_id retorna essa org (read-only — use current_org_for_write pra mutations). Caminho normal: users.active_org_id sem re-checagem de membership (validação no API write).';

COMMENT ON FUNCTION public.current_org_for_write() IS
  'Versão estrita — ignora impersonate. Bloqueia writes de Admin impersonando no DB level (defense-in-depth; defesa real é requireOwnerWrite no API).';

REVOKE EXECUTE ON FUNCTION public.current_org()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_org_for_write() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_org()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.current_org_for_write() TO authenticated, service_role;

-- ─── PARTE 4: get_user_org_context com sub 'trial' on-read ──────────────────
-- Quando subscription_status='trial' e trial_ends_at já passou, devolve
-- 'inactive' pro caller (lib/auth.ts:requireActiveSubscription bloqueia).
-- Estado físico no DB ainda é 'trial' — cron em 046 limpa.

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',        u.active_org_id,
    'role',               m.role,
    'planCode',           p.code,
    'hasRag',             COALESCE(p.has_rag, false),
    'maxSalesPeople',     p.max_sales_people,
    'maxCallsPerMonth',   p.max_calls_per_month,
    'subscriptionStatus',
      CASE
        WHEN o.subscription_status = 'trial'
         AND o.trial_ends_at IS NOT NULL
         AND o.trial_ends_at < now()
        THEN 'inactive'
        ELSE COALESCE(o.subscription_status, 'inactive')
      END,
    'trialEndsAt',        o.trial_ends_at
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.plans         p ON p.id            = o.plan_id
  WHERE      u.id = p_user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_org_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_org_context(uuid) TO   service_role;

-- ─── PARTE 5: RLS habilitado em users e trainers ────────────────────────────

ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- ─── PARTE 6: Policies — users ──────────────────────────────────────────────
-- 2 policies apenas: service_role bypass + select_self. Cross-org user
-- listing fica via service_role no app code (lib/db/*.ts). NÃO criamos
-- users_select_same_org porque a subquery em memberships criava ciclo
-- via current_org() lendo users.

DROP POLICY IF EXISTS "users_service_role_all" ON public.users;
DROP POLICY IF EXISTS "users_select_self"      ON public.users;
DROP POLICY IF EXISTS "users_select_same_org"  ON public.users;

CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- ─── PARTE 7: Policies — trainers ───────────────────────────────────────────

DROP POLICY IF EXISTS "trainers_service_role_all" ON public.trainers;
DROP POLICY IF EXISTS "trainers_select_by_org"    ON public.trainers;

CREATE POLICY "trainers_service_role_all" ON public.trainers
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "trainers_select_by_org" ON public.trainers
  FOR SELECT
  USING (org_id = public.current_org());

-- ─── PARTE 8: Policies — organizations / memberships ────────────────────────

DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = public.current_org());

-- memberships mantém só select_own (do 027). Não criamos select_by_org
-- pra evitar qualquer chance residual de ciclo via current_org → memberships.
DROP POLICY IF EXISTS "memberships_select_by_org" ON public.memberships;

-- ─── PARTE 9: Policies — tenant data (calls, rubrics, criteria, scripts) ────

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

-- ─── PARTE 10: Policies — insights / marketing_runs ─────────────────────────

DROP POLICY IF EXISTS "insights_select_by_org" ON public.insights;
CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "insights_write_by_org" ON public.insights;
CREATE POLICY "insights_write_by_org" ON public.insights
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "marketing_runs_select_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_select_by_org" ON public.marketing_runs
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

-- ─── PARTE 11: admin_impersonations — audit log ─────────────────────────────
-- Minimização LGPD: só (admin, org, when). Sem IP/UA por enquanto.
-- Lockdown total — só service_role acessa (createAdminClient via /api/admin/impersonate).

CREATE TABLE IF NOT EXISTS public.admin_impersonations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID REFERENCES public.users(id)         ON DELETE SET NULL,
  target_org_id   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  CONSTRAINT admin_impersonations_lifecycle_chk
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS admin_impersonations_active_idx
  ON public.admin_impersonations(admin_user_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_impersonations_org_idx
  ON public.admin_impersonations(target_org_id, started_at DESC);

CREATE INDEX IF NOT EXISTS admin_impersonations_started_at_idx
  ON public.admin_impersonations(started_at DESC);

ALTER TABLE public.admin_impersonations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_impersonations FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_impersonations FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.admin_impersonations TO   service_role;

CREATE OR REPLACE FUNCTION public.close_admin_impersonation(
  p_admin_user_id UUID,
  p_target_org_id UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admin_impersonations
     SET ended_at = now()
   WHERE id = (
     SELECT id
     FROM   public.admin_impersonations
     WHERE  admin_user_id = p_admin_user_id
       AND  target_org_id = p_target_org_id
       AND  ended_at      IS NULL
     ORDER BY started_at DESC
     LIMIT 1
   )
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  TO   service_role;

COMMENT ON TABLE  public.admin_impersonations IS
  'Audit log de Admin entrando em orgs via impersonate. Uma row por sessão. Nunca exposto pra client — só service_role via createAdminClient.';

COMMENT ON COLUMN public.admin_impersonations.ended_at IS
  'NULL = sessão aberta. Set por close_admin_impersonation() ou job de cleanup futuro pra sessões >24h.';
