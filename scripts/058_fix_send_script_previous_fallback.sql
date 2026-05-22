-- ============================================================
-- 058_fix_send_script_previous_fallback.sql
--
-- Corrige a RPC send_script_to_orgs para buscar o previous_script_id
-- com fallback: primeiro tenta org_scripts (status='active'), e se não
-- encontrar, tenta scripts (is_active=true, org_id=org_id). Isso garante
-- que orgs que têm script ativo apenas via scripts.is_active (sem linha
-- em org_scripts) também tenham o previous correto registrado.
--
-- Também garante que antes do send, toda org com scripts.is_active=true
-- tenha uma linha correspondente em org_scripts status='active'.
--
-- Idempotente. Rode após 057.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  id          UUID,
  org_id      UUID,
  script_id   UUID,
  status      TEXT,
  started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do script ativo antes do close.
  -- Prioridade 1: linha em org_scripts com status='active' e ended_at IS NULL.
  -- Prioridade 2: scripts.is_active=true para a org (script ativo que ainda não
  --   tem linha em org_scripts).
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (combined.target_org_id)
      combined.target_org_id,
      combined.prev_script_id,
      combined.priority
    FROM (
      -- P1: org_scripts ativo
      SELECT
        os.org_id    AS target_org_id,
        os.script_id AS prev_script_id,
        1            AS priority
      FROM public.org_scripts os
      WHERE os.org_id = ANY(p_org_ids)
        AND os.status = 'active'
        AND os.ended_at IS NULL

      UNION ALL

      -- P2: scripts.is_active=true (fallback para orgs sem linha em org_scripts)
      SELECT
        s.org_id     AS target_org_id,
        s.id         AS prev_script_id,
        2            AS priority
      FROM public.scripts s
      WHERE s.org_id = ANY(p_org_ids)
        AND s.is_active = true
    ) combined
    ORDER BY combined.target_org_id, combined.priority ASC;

  -- 1) Fecha qualquer associação aberta (ended_at IS NULL) das orgs alvo.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  -- 2) Upsert pending com previous_script_id correto.
  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria pending com previous_script_id via fallback (org_scripts ativo → scripts.is_active). Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;
