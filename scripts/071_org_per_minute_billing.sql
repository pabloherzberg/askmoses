-- ============================================================
-- 071_org_per_minute_billing.sql
--
-- Migra o modelo de cobrança de MRR fixo para consumo por minuto (US$/min).
--
-- Os minutos consumidos por org NÃO são materializados numa coluna: são
-- agregados dinamicamente de calls.duration_seconds (minuto iniciado conta
-- como minuto cheio → CEIL(SUM/60)). Isso evita dessincronização e o reset
-- mensal manual que uma coluna exigiria. O custo (US$/min) também não é
-- persistido — é derivado em TS (lib/utils.ts · COST_PER_MINUTE_USD).
--
-- A coluna organizations.mrr é PRESERVADA — o override manual de assinatura
-- (Admin) e a tela de detalhe da org ainda a leem. Apenas o painel /admin
-- (tabela + filtros) e as métricas globais passam a usar minutos/custo.
--
-- NOTE: uma versão anterior desta migration chegou a criar a coluna
-- organizations.total_minutes_this_month. O DROP COLUMN abaixo a remove de
-- forma idempotente, caso já tenha sido aplicada.
--
-- Idempotente. Rode após 070.
-- ============================================================

-- ─── 1. Remove a função e a coluna materializada (cleanup) ──────────────
-- DROP da função antes da coluna: a versão anterior da RPC referenciava
-- o.total_minutes_this_month. plpgsql é late-bound, mas dropamos a função
-- primeiro de qualquer forma pra recriá-la limpa logo abaixo.

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS total_minutes_this_month;

-- ─── 2. Recria RPC list_admin_organizations com minutos dinâmicos ───────
-- Os minutos vêm da CTE month_minutes (agrega calls.duration_seconds do mês
-- corrente por org). Filtro de range usa p_minutes_min/p_minutes_max
-- (substitui o antigo p_mrr_min/p_mrr_max); o retorno expõe
-- org_total_minutes_this_month no lugar de org_mrr.

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_minutes_min        NUMERIC       DEFAULT NULL,
  p_minutes_max        NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                       UUID,
  org_name                     TEXT,
  org_created_at               TIMESTAMPTZ,
  org_subscription_status      TEXT,
  org_total_minutes_this_month INT,
  org_health                   TEXT,
  org_trainers_count           INT,
  org_calls_this_month         INT,
  org_avg_score                INT,
  plan_id                      UUID,
  plan_code                    TEXT,
  plan_name                    TEXT,
  plan_price_cents             INT,
  plan_timeline_weeks          INT,
  plan_has_rag                 BOOLEAN,
  plan_has_twilio              BOOLEAN,
  plan_has_manual_upload       BOOLEAN,
  plan_max_sales_people        INT,
  plan_features                JSONB,
  owner_accepted               BOOLEAN,
  script_id                    UUID,
  script_name                  TEXT,
  script_major_version         INT,
  script_minor_version         INT,
  script_owner_edit_version    INT,
  script_status                TEXT,
  script_started_at            TIMESTAMPTZ,
  prev_script_major            INT,
  prev_script_minor            INT,
  prev_script_owner_edit       INT,
  last_call_at                 TIMESTAMPTZ,
  total                        BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_month_start  TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  -- Split "1.2" or "1.2.3" → major=1, minor=2 (owner_edit not filtered).
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := (split_part(p_script_version, '.', 1))::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := (split_part(p_script_version, '.', 2))::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.owner_edit_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor,
        osc.owner_edit_version      AS prev_owner_edit
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
    -- Minutos consumidos no mês corrente por org. CEIL(sum/60) → minuto
    -- iniciado conta como cheio (semântica de billing).
    month_minutes AS (
      SELECT c.org_id,
             CEIL(COALESCE(SUM(c.duration_seconds), 0) / 60.0)::INT AS total_minutes
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
        AND c.created_at >= v_month_start
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
        COALESCE(mm.total_minutes, 0) AS total_minutes_this_month,
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
        cs.rubric_version_snapshot  AS script_major,
        cs.minor_version             AS script_minor,
        cs.owner_edit_version        AS script_owner_edit,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        ps.prev_owner_edit,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN month_minutes    mm ON mm.org_id = o.id
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
        AND (p_minutes_min IS NULL OR COALESCE(mm.total_minutes, 0) >= p_minutes_min)
        AND (p_minutes_max IS NULL OR COALESCE(mm.total_minutes, 0) <= p_minutes_max)
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
    f.total_minutes_this_month,
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
    COALESCE(f.script_major, 1),
    COALESCE(f.script_minor, 0),
    COALESCE(f.script_owner_edit, 0),
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    COALESCE(f.prev_owner_edit, 0),
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
  'Lista paginada e filtrada de orgs pro painel /admin. '
  'Migration 071: cobrança por minuto — org_total_minutes_this_month agregado '
  'dinamicamente de calls.duration_seconds (mês corrente) e filtro '
  'p_minutes_min/p_minutes_max (substitui org_mrr / p_mrr_*).';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;
