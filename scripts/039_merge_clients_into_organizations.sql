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
--   4. Trigger functions enforce_seat_limit() e enforce_call_limit()
--      reescritas pra ler de organizations.plan_id (antes liam via
--      organizations → clients → plans, JOIN quebraria pós-drop)
--   5. organizations.client_id (FK reverso) é dropado
--   6. clients table inteira é dropada (CASCADE limpa policy/indexes)
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

-- ─── 5. Recriar trigger functions que liam plano via clients ────────────────
-- Migration 032 criou enforce_seat_limit() e enforce_call_limit() com JOIN
-- via clients (organizations → clients → plans). Pós-merge esses triggers
-- referenciam tabela que vai sumir no step 7 — qualquer INSERT em
-- memberships ou calls quebra com `relation "public.clients" does not exist`.
-- Reescritas aqui pra LER direto de organizations.plan_id.

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
BEGIN
  IF NEW.role = 'trainer' AND NEW.invite_status IN ('pending', 'accepted') THEN
    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.org_id::text));

    SELECT p.max_sales_people
    INTO   v_max
    FROM   public.organizations o
    JOIN   public.plans         p ON p.id = o.plan_id
    WHERE  o.id = NEW.org_id;

    IF v_max IS NOT NULL THEN
      SELECT count(*)
      INTO   v_count
      FROM   public.memberships
      WHERE  org_id        = NEW.org_id
        AND  role          = 'trainer'
        AND  invite_status IN ('pending', 'accepted');

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'PLAN_LIMIT_SEATS: org % at trainer cap (% / %)',
          NEW.org_id, v_count, v_max
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_call_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
  v_start TIMESTAMPTZ;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('calls:' || NEW.org_id::text));

  SELECT p.max_calls_per_month
  INTO   v_max
  FROM   public.organizations o
  JOIN   public.plans         p ON p.id = o.plan_id
  WHERE  o.id = NEW.org_id;

  IF v_max IS NOT NULL THEN
    v_start := date_trunc('month', now());
    SELECT count(*)
    INTO   v_count
    FROM   public.calls
    WHERE  org_id     = NEW.org_id
      AND  created_at >= v_start;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_CALLS: org % at monthly cap (% / %)',
        NEW.org_id, v_count, v_max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 6. Drop FK organizations.client_id ─────────────────────────────────────
-- Nome do constraint segue o padrão {table}_{column}_fkey do Postgres autogen.
-- IF EXISTS evita erro caso o nome divergir em algum ambiente.

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_client_id_fkey;

DROP INDEX IF EXISTS organizations_client_id_idx;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS client_id;

-- ─── 7. Drop tabela clients ─────────────────────────────────────────────────
-- CASCADE limpa RLS policy "clients_service_role_all", índices
-- (clients_plan_id_idx, clients_org_id_idx, clients_subscription_status_idx)
-- e qualquer outra dependência residual em uma operação.

DROP TABLE IF EXISTS public.clients CASCADE;
