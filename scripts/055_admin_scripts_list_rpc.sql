-- ============================================================
-- 052_admin_scripts_list_rpc.sql
--
-- RPC list_admin_scripts(): listagem paginada + busca da tabela de
-- scripts pro SAAS Panel (aba "Scripts").
--
-- Busca (p_search) bate em OR contra 4 campos — se QUALQUER um casar,
-- o script fica na tabela:
--   1. scripts.name
--   2. scripts.description
--   3. versão "major.minor" (rubric_version_snapshot.minor_version)
--   4. conteúdo das sections (JSONB) — name/instructions/tips de cada
--
-- Paginação: p_page (1-indexed), p_limit. total = count pré-paginação.
--
-- Idempotente. Rode após 044.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_scripts(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.list_admin_scripts(
  p_search TEXT DEFAULT NULL,
  p_page   INT  DEFAULT 1,
  p_limit  INT  DEFAULT 25
)
RETURNS TABLE(
  id              UUID,
  name            TEXT,
  description     TEXT,
  rubric_id       UUID,
  rubric_name     TEXT,
  major_version   INT,
  minor_version   INT,
  sections_count  INT,
  criteria_count  INT,
  created_at      TIMESTAMPTZ,
  total           BIGINT
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
      COALESCE(s.rubric_version_snapshot, 1) AS major_version,
      COALESCE(s.minor_version, 0)           AS minor_version,
      -- Contagem defensiva: sections/criteria podem ser não-array.
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
        COALESCE(s.minor_version, 0)::TEXT
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
    f.sections_count,
    f.criteria_count,
    f.created_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.major_version ASC, f.minor_version ASC, f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_scripts IS
  'Lista paginada de scripts pro SAAS Panel. Busca em name/description/versão/sections.';

GRANT EXECUTE ON FUNCTION public.list_admin_scripts(TEXT, INT, INT) TO service_role;
