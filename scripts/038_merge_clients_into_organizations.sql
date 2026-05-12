-- ============================================================
-- 038_merge_clients_into_organizations.sql
-- Mescla clients dentro de organizations. Conceitualmente os dois
-- representam a mesma entidade (1:1 mirror via app code) — manter
-- separados gerava risco de drift e queries com JOIN desnecessário.
-- A pedido do Vitor pra simplificar o modelo antes que mais código
-- dependa da divisão.
--
-- Mudanças:
--   1. organizations ganha: plan_id, subscription_status, health,
--      mrr, calls_this_month, avg_score, trainers_count
--   2. Backfill: cada org puxa os valores do client espelho
--   3. RPC get_user_org_context atualizada — JOIN direto via plans
--   4. organizations.client_id (FK reverso) é dropado
--   5. clients table inteira é dropada (CASCADE limpa policy/indexes)
--
-- Code refactor associado nesta mesma commit (lib/db/clients.ts,
-- api/organizations, api/invites, api/onboarding/*) — sem isso, queries
-- antigas quebram quando a tabela some.
-- ============================================================

-- ─── 1. Colunas novas em organizations ───────────────────────────────────────
-- Defaults conservadores: orgs sem mirror anterior (caso raro de seed
-- inconsistente) caem em 'inactive' + 'healthy' + zeros, mesmo comportamento
-- da self-service onboarding pré-pagamento.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_id             UUID REFERENCES public.plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
                              CHECK (subscription_status IN ('inactive', 'active')),
  ADD COLUMN IF NOT EXISTS health              TEXT NOT NULL DEFAULT 'healthy'
                              CHECK (health IN ('healthy', 'at-risk', 'churning')),
  ADD COLUMN IF NOT EXISTS mrr                 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_this_month    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_score           INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trainers_count      INT DEFAULT 0;

-- ─── 2. Backfill: copia tudo do client espelho pra organizations ────────────
-- Guard pra idempotência: se a migration já rodou em outro ambiente e a
-- tabela clients já não existe, pula o backfill (UPDATE referenciaria
-- tabela inexistente e erraria). Re-rodadas viram no-op seguro.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    UPDATE public.organizations o
    SET
      plan_id             = c.plan_id,
      subscription_status = c.subscription_status,
      health              = c.health,
      mrr                 = c.mrr,
      calls_this_month    = c.calls_this_month,
      avg_score           = c.avg_score,
      trainers_count      = c.trainers_count
    FROM public.clients c
    WHERE c.org_id = o.id;
  END IF;
END $$;

-- ─── 3. Índices novos no organizations ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS organizations_plan_id_idx
  ON public.organizations(plan_id);

CREATE INDEX IF NOT EXISTS organizations_subscription_status_idx
  ON public.organizations(subscription_status);

-- ─── 4. RPC get_user_org_context — JOIN direto em organizations ─────────────
-- Antes a função fazia users → memberships → organizations → clients → plans.
-- Agora: users → memberships → organizations → plans. Um LEFT JOIN a menos.

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
    'subscriptionStatus', COALESCE(o.subscription_status, 'inactive')
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.plans         p ON p.id            = o.plan_id
  WHERE      u.id = p_user_id
$$;

-- ─── 5. Drop FK organizations.client_id ─────────────────────────────────────
-- Nome do constraint segue o padrão {table}_{column}_fkey do Postgres autogen.
-- IF EXISTS evita erro caso o nome divergir em algum ambiente.

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_client_id_fkey;

DROP INDEX IF EXISTS organizations_client_id_idx;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS client_id;

-- ─── 6. Drop tabela clients ─────────────────────────────────────────────────
-- CASCADE limpa RLS policy "clients_service_role_all", índices
-- (clients_plan_id_idx, clients_org_id_idx, clients_subscription_status_idx)
-- e qualquer outra dependência residual em uma operação.

DROP TABLE IF EXISTS public.clients CASCADE;
