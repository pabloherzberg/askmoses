-- ============================================================
-- 032_harden_security_and_atomic_limits.sql
--
-- Cobre 4 issues levantados em code review:
--
-- 1) RPCs `get_user_org_context(uuid)` e `get_memberships_for_switcher(uuid)`
--    eram SECURITY DEFINER e aceitavam UUID arbitrário, sem REVOKE.
--    Qualquer user autenticado podia chamar com outro user_id e obter
--    org/role/plano alheios. Solução: REVOKE EXECUTE de PUBLIC/anon/
--    authenticated; só service_role chama (lib/auth.ts usa createAdminClient).
--
-- 2) Gate de seats em /api/invites era count + insert separados — race
--    permitia 2 convites concorrentes passarem na mesma vaga. Trigger
--    BEFORE INSERT em memberships com pg_advisory_xact_lock fecha o gap.
--
-- 3) Mesmo problema em calls (TC-10). Trigger BEFORE INSERT em calls.
--
-- 4) Defesa em profundidade — mesmo se a app esquecer o pre-check, o
--    DB rejeita.
-- ============================================================

-- ─── 1. Lockdown das RPCs (sem mudar assinatura) ─────────────────────────────

REVOKE EXECUTE ON FUNCTION public.get_user_org_context(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_memberships_for_switcher(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_org_context(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_memberships_for_switcher(uuid) TO service_role;

-- ─── 2. Trigger atômico de seat limit em memberships ─────────────────────────
-- Roda em BEFORE INSERT. pg_advisory_xact_lock(hashtext('seats:'||org_id))
-- serializa inserts concorrentes pra mesma org. Lock dura até o fim da
-- transação corrente — se 2 inserts disputarem a última vaga, um espera o
-- outro e relê a contagem antes de decidir.

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
  -- Só conta seats pra trainers. Owners não consomem (decisão de produto).
  IF NEW.role = 'trainer' AND NEW.invite_status IN ('pending', 'accepted') THEN
    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.org_id::text));

    SELECT p.max_sales_people
    INTO   v_max
    FROM   public.organizations o
    JOIN   public.clients       c ON c.id = o.client_id
    JOIN   public.plans         p ON p.id = c.plan_id
    WHERE  o.id = NEW.org_id;

    -- NULL = ilimitado (Pro+RAG). Skip.
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

DROP TRIGGER IF EXISTS memberships_enforce_seat_limit ON public.memberships;
CREATE TRIGGER memberships_enforce_seat_limit
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

-- ─── 3. Trigger atômico de calls/mês limit em calls ──────────────────────────

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
    RETURN NEW; -- calls antigas sem org (legado pré-012) não são gateadas
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('calls:' || NEW.org_id::text));

  SELECT p.max_calls_per_month
  INTO   v_max
  FROM   public.organizations o
  JOIN   public.clients       c ON c.id = o.client_id
  JOIN   public.plans         p ON p.id = c.plan_id
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

DROP TRIGGER IF EXISTS calls_enforce_limit ON public.calls;
CREATE TRIGGER calls_enforce_limit
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_call_limit();
