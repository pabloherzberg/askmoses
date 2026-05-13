-- ============================================================
-- 040_admin_impersonate_and_rls.sql
-- Multi-tenant infra hardening + Admin impersonate (read-only).
--
-- Cobre 4 frentes:
--
-- 1) Subscription state expandido (decisão Victor 2026-05-13, Q5):
--      - subscription_status ganha 'trial'
--      - organizations.trial_ends_at (auto inactivation quando passa)
--      - organizations.admin_override (Stripe webhook futuro respeita)
--
-- 2) RLS gaps da auditoria (2026-05-13):
--      - users e trainers SEM RLS hoje → habilitar + policies por org
--      - calls falta DELETE policy
--      - insights só tem SELECT → adicionar INSERT/UPDATE/DELETE
--      - memberships falta SELECT org-scoped (Owner listando time via RLS)
--
-- 3) Admin impersonate (decisão Victor 2026-05-13, Q4 — read-only):
--      - current_org() aceita override via JWT claim
--        app_metadata.impersonating_org_id quando role='admin'
--      - current_org_for_write() é versão estrita (não aceita impersonate)
--        usada por WITH CHECK / FOR INSERT|UPDATE|DELETE em todas as
--        tabelas tenant-scoped — DB-level defense in depth contra Admin
--        impersonando + esquecendo o requireOwnerWrite() no API layer
--
-- 4) Sub 'trial' compatível com requireActiveSubscription() — lib/auth.ts
--    precisa ser atualizada em paralelo pra tratar 'trial' como ativo
--    (mudança no TS, não no SQL).
--
-- Idempotente — checks de pg_constraint, IF NOT EXISTS, OR REPLACE.
-- ============================================================

-- ─── 1. Subscription state expandido ─────────────────────────────────────────

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
  'Quando o trial vira inactive automaticamente. Job/check em get_user_org_context flippa o status se passou. NULL = sem trial ativo.';

COMMENT ON COLUMN public.organizations.admin_override IS
  'true = Admin setou subscription_status manualmente (trial/active/inactive). Stripe webhook deve respeitar e não sobrescrever.';

-- ─── 2. current_org_for_write() — versão estrita, ignora impersonate ─────────
-- DB-level defense in depth: Admin impersonando satisfaz current_org() (read)
-- mas NÃO satisfaz current_org_for_write() — todas as RLS policies de write
-- usam essa função, então mesmo se algum endpoint esquecer requireOwnerWrite()
-- no API layer, o DB rejeita a mutation com policy violation.

CREATE OR REPLACE FUNCTION public.current_org_for_write()
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

-- ─── 3. current_org() — aceita impersonate read-only quando role='admin' ────
-- Admin com JWT app_metadata.impersonating_org_id setado lê dados daquela org
-- via SELECT policies. Membership não é exigida nesse caminho (Admin não tem).
-- Pra writes, usar current_org_for_write() nas policies.

CREATE OR REPLACE FUNCTION public.current_org()
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
      FROM   public.users u
      WHERE  u.id = auth.uid()
        AND  EXISTS (
          SELECT 1
          FROM   public.memberships m
          WHERE  m.user_id       = u.id
            AND  m.org_id        = u.active_org_id
            AND  m.invite_status = 'accepted'
        )
    )
  END
$$;

-- ─── 4. RLS em users (auditoria — tabela exposta cross-tenant) ──────────────
-- users hoje não tem RLS habilitado. Toda proteção depende de createAdminClient
-- bypassar RLS. Qualquer rota que use o supabase client normal lê users de
-- TODAS as orgs. Fechamos isso aqui:
--   - service_role: ALL (mantém o padrão dos lib/db/*.ts)
--   - SELECT própria row (settings, profile)
--   - SELECT mesma org via memberships (Owner listando time, Trainer vendo
--     colegas — todos os caminhos legítimos)

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_service_role_all" ON public.users;
CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "users_select_self" ON public.users;
CREATE POLICY "users_select_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_select_same_org" ON public.users;
CREATE POLICY "users_select_same_org" ON public.users
  FOR SELECT
  USING (
    id IN (
      SELECT m.user_id
      FROM   public.memberships m
      WHERE  m.org_id        = public.current_org()
        AND  m.invite_status = 'accepted'
    )
  );

-- ─── 5. RLS em trainers (auditoria — mesma exposição) ──────────────────────
-- trainers tem org_id desde 013 mas nunca recebeu RLS. Mesma estratégia:
-- service_role + SELECT por org. Mutations só via service_role (consistente
-- com lib/db/trainers.ts).

ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainers_service_role_all" ON public.trainers;
CREATE POLICY "trainers_service_role_all" ON public.trainers
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "trainers_select_by_org" ON public.trainers;
CREATE POLICY "trainers_select_by_org" ON public.trainers
  FOR SELECT
  USING (org_id = public.current_org());

-- ─── 6. memberships: SELECT org-scoped (Owner lista time via RLS) ──────────
-- 027 deu select_own (user_id=auth.uid). Owner precisa ver as outras
-- memberships da própria org. Não adicionamos write policies — invites/
-- onboarding/admin continuam via service_role.

DROP POLICY IF EXISTS "memberships_select_by_org" ON public.memberships;
CREATE POLICY "memberships_select_by_org" ON public.memberships
  FOR SELECT
  USING (org_id = public.current_org());

-- ─── 7. calls: faltava DELETE policy ────────────────────────────────────────
-- Cobertura completa: SELECT (current_org), INSERT/UPDATE (current_org_for_write
-- recriadas), DELETE (nova).

DROP POLICY IF EXISTS "calls_delete_by_org" ON public.calls;
CREATE POLICY "calls_delete_by_org" ON public.calls
  FOR DELETE
  USING (org_id = public.current_org_for_write());

-- ─── 8. insights: faltava INSERT/UPDATE/DELETE ──────────────────────────────
-- 013 só criou SELECT. Insights são geradas por jobs/services, todas via
-- service_role na prática — mas adicionamos policies for-write usando
-- current_org_for_write() pra Admin impersonando NÃO conseguir escrever.

DROP POLICY IF EXISTS "insights_write_by_org" ON public.insights;
CREATE POLICY "insights_write_by_org" ON public.insights
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- ─── 9. Recriar policies de write pra usar current_org_for_write() ─────────
-- Política antiga em calls/rubrics/criteria/scripts/marketing_runs usa
-- current_org() — Admin impersonando passaria. Trocamos pra current_org_for_write()
-- que ignora impersonate. SELECT continua com current_org() pra Admin ler.

-- calls INSERT/UPDATE
DROP POLICY IF EXISTS "calls_insert_by_org" ON public.calls;
CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "calls_update_by_org" ON public.calls;
CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- rubrics write
DROP POLICY IF EXISTS "rubrics_write_by_org" ON public.rubrics;
CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- criteria write
DROP POLICY IF EXISTS "criteria_write_by_org" ON public.criteria;
CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- scripts write
DROP POLICY IF EXISTS "scripts_write_by_org" ON public.scripts;
CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- marketing_runs INSERT
DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

-- ─── 10. Atualizar get_user_org_context — sub 'trial' + auto inactivation ──
-- Quando trial_ends_at < now() e admin_override está false, o user deve ver
-- 'inactive' (mesmo que o DB ainda tenha 'trial' antes do job de cleanup).
-- COALESCE garante caso default. Tratamos como ativo no TS quando 'active'
-- OU 'trial' (requireActiveSubscription).

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

-- Manter o lockdown de 032 (REVOKE PUBLIC, GRANT service_role) — a recriação
-- acima preserva ACL no Postgres pra REPLACE de função SQL, mas garantimos
-- explicitamente caso o ambiente esteja desnormalizado.
REVOKE EXECUTE ON FUNCTION public.get_user_org_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_org_context(uuid) TO   service_role;

-- ─── 11. Comentários de documentação ────────────────────────────────────────

COMMENT ON FUNCTION public.current_org() IS
  'Org ativa do user corrente. Admin com app_metadata.impersonating_org_id setado retorna essa org (read-only — usar current_org_for_write() pra mutations). Caminho normal: users.active_org_id + membership aceita.';

COMMENT ON FUNCTION public.current_org_for_write() IS
  'Versão estrita de current_org() — ignora impersonate. Usada em policies WITH CHECK / FOR INSERT|UPDATE|DELETE. Garante que Admin impersonando NÃO consegue escrever via RLS, mesmo se o API layer esquecer requireOwnerWrite().';
