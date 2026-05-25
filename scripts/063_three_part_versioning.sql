-- ============================================================
-- 063_three_part_versioning.sql
--
-- Introduz o terceiro segmento de versão dos scripts: owner_edit_version.
--
-- Formato final: v{rubric_version_snapshot}.{minor_version}.{owner_edit_version}
--   Segmento 1 — rubric_version_snapshot : versão da rubrica base
--   Segmento 2 — minor_version           : versão enviada pelo admin
--   Segmento 3 — owner_edit_version      : revisões feitas pelo owner (começa em 0)
--
-- Scripts existentes recebem owner_edit_version = 0 (backfill).
-- A view org_scripts_current é atualizada pra expor o novo campo.
-- As RPCs list_admin_organizations e list_admin_scripts são atualizadas
-- pra incluir o terceiro segmento.
--
-- Idempotente. Rode após 062.
-- ============================================================

-- ─── 1. Adiciona coluna na tabela scripts ───────────────────────────────

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS owner_edit_version INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.scripts.owner_edit_version IS
  'Terceiro segmento da versão: conta edições feitas diretamente pelo owner. '
  'Começa em 0 (script criado pelo admin). Incrementado cada vez que o owner '
  'salva uma edição manual no script da sua org.';

-- ─── 2. Recria view org_scripts_current com o novo campo ────────────────

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  s.owner_edit_version,
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1
        FROM public.org_scripts os2
        JOIN public.scripts s2 ON s2.id = os2.script_id
       WHERE os2.org_id = os.org_id
         AND s2.rubric_id = s.rubric_id
         AND os2.ended_at IS NULL
         AND os2.id <> os.id
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version) OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version = s.minor_version
            AND s2.owner_edit_version > s.owner_edit_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado). '
  'A partir da migration 062, deprecated só é calculado contra scripts enviados '
  'para a mesma org. Migration 063 adiciona o terceiro segmento owner_edit_version.';

-- ─── 3. Recria RPC list_admin_organizations com terceiro segmento ───────

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
  org_id                     UUID,
  org_name                   TEXT,
  org_created_at             TIMESTAMPTZ,
  org_subscription_status    TEXT,
  org_mrr                    NUMERIC,
  org_health                 TEXT,
  org_trainers_count         INT,
  org_calls_this_month       INT,
  org_avg_score              INT,
  plan_id                    UUID,
  plan_code                  TEXT,
  plan_name                  TEXT,
  plan_price_cents           INT,
  plan_timeline_weeks        INT,
  plan_has_rag               BOOLEAN,
  plan_has_twilio            BOOLEAN,
  plan_has_manual_upload     BOOLEAN,
  plan_max_sales_people      INT,
  plan_features              JSONB,
  owner_accepted             BOOLEAN,
  script_id                  UUID,
  script_name                TEXT,
  script_major_version       INT,
  script_minor_version       INT,
  script_owner_edit_version  INT,
  script_status              TEXT,
  script_started_at          TIMESTAMPTZ,
  prev_script_major          INT,
  prev_script_minor          INT,
  prev_script_owner_edit     INT,
  last_call_at               TIMESTAMPTZ,
  total                      BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
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
  'Migration 063: inclui script_owner_edit_version e prev_script_owner_edit no retorno.';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;

-- ─── 4. Recria RPC list_admin_scripts com terceiro segmento ─────────────

DROP FUNCTION IF EXISTS public.list_admin_scripts(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.list_admin_scripts(
  p_search TEXT DEFAULT NULL,
  p_page   INT  DEFAULT 1,
  p_limit  INT  DEFAULT 25
)
RETURNS TABLE(
  id                  UUID,
  name                TEXT,
  description         TEXT,
  rubric_id           UUID,
  rubric_name         TEXT,
  major_version       INT,
  minor_version       INT,
  owner_edit_version  INT,
  sections_count      INT,
  criteria_count      INT,
  created_at          TIMESTAMPTZ,
  total               BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_q      TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.name,
      s.description,
      s.rubric_id,
      r.name AS rubric_name,
      COALESCE(s.rubric_version_snapshot, 1)  AS major_version,
      COALESCE(s.minor_version, 0)             AS minor_version,
      COALESCE(s.owner_edit_version, 0)        AS owner_edit_version,
      CASE
        WHEN jsonb_typeof(s.sections) = 'array'
        THEN jsonb_array_length(s.sections)
        ELSE 0
      END AS sections_count,
      CASE
        WHEN jsonb_typeof(s.criteria) = 'array'
        THEN jsonb_array_length(s.criteria)
        ELSE 0
      END AS criteria_count,
      s.created_at
    FROM public.scripts s
    LEFT JOIN public.rubrics r ON r.id = s.rubric_id
    WHERE
      v_q IS NULL
      OR s.name ILIKE '%' || v_q || '%'
      OR COALESCE(s.description, '') ILIKE '%' || v_q || '%'
      OR (
        COALESCE(s.rubric_version_snapshot, 1)::TEXT || '.' ||
        COALESCE(s.minor_version, 0)::TEXT || '.' ||
        COALESCE(s.owner_edit_version, 0)::TEXT
      ) ILIKE '%' || v_q || '%'
      OR (
        jsonb_typeof(s.sections) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(s.sections) AS elem
          WHERE COALESCE(elem->>'name', '')         ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'instructions', '') ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'tips', '')         ILIKE '%' || v_q || '%'
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS n FROM filtered
  )
  SELECT
    f.id,
    f.name,
    f.description,
    f.rubric_id,
    f.rubric_name,
    f.major_version,
    f.minor_version,
    f.owner_edit_version,
    f.sections_count,
    f.criteria_count,
    f.created_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.major_version ASC, f.minor_version ASC, f.owner_edit_version ASC, f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_scripts IS
  'Lista paginada de scripts pro SAAS Panel. Migration 063: inclui owner_edit_version no retorno.';

GRANT EXECUTE ON FUNCTION public.list_admin_scripts(TEXT, INT, INT) TO service_role;
