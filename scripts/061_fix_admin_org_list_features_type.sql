-- ============================================================
-- 059_fix_admin_org_list_features_type.sql
--
-- Conserta regressão da migration 058. Ao reescrever list_admin_organizations
-- pra filtrar current_scripts por effective_status IN ('active','deprecated'),
-- a 058 copiou a estrutura do RPC original (048) e perdeu o fix da 049 nos
-- tipos do RETURNS TABLE:
--   - plan_features: declarava TEXT[], mas plans.features é JSONB no schema
--     (migration 018) → COALESCE(f.features, ARRAY[]::TEXT[]) joga
--     "COALESCE types jsonb and text[] cannot be matched" em runtime.
--   - org_avg_score: declarava NUMERIC, mas a 049 padronizou em INT.
--
-- Esta migration recria o RPC com:
--   - Tipos corretos do RETURNS TABLE (JSONB + INT, alinhado com 049).
--   - O filtro novo da 058 preservado (current_scripts só active|deprecated).
--
-- Idempotente. Rode após 058.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                  UUID,
  org_name                TEXT,
  org_created_at          TIMESTAMPTZ,
  org_subscription_status TEXT,
  org_mrr                 NUMERIC,
  org_health              TEXT,
  org_trainers_count      INT,
  org_calls_this_month    INT,
  org_avg_score           INT,
  plan_id                 UUID,
  plan_code               TEXT,
  plan_name               TEXT,
  plan_price_cents        INT,
  plan_timeline_weeks     INT,
  plan_has_rag            BOOLEAN,
  plan_has_twilio         BOOLEAN,
  plan_has_manual_upload  BOOLEAN,
  plan_max_sales_people   INT,
  plan_features           JSONB,
  owner_accepted          BOOLEAN,
  script_id               UUID,
  script_name             TEXT,
  script_major_version    INT,
  script_minor_version    INT,
  script_status           TEXT,
  script_started_at       TIMESTAMPTZ,
  prev_script_major       INT,
  prev_script_minor       INT,
  last_call_at            TIMESTAMPTZ,
  total                   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
BEGIN
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := SPLIT_PART(p_script_version, '.', 1)::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := SPLIT_PART(p_script_version, '.', 2)::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    -- "Current" do painel = script ACTIVE (effective_status active|deprecated).
    -- Pending vive em row separada após 057 — não é mais o "current".
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
        AND osc.effective_status IN ('active', 'deprecated')
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version            AS script_minor,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, '[]'::jsonb),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    f.script_major,
    f.script_minor,
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. current_scripts filtra active|deprecated (058 + 059 — pending coexiste após 057; tipos do retorno alinhados com 049: JSONB features, INT avg_score).';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;
