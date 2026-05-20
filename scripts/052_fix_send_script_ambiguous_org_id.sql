-- ============================================================
-- 052_fix_send_script_ambiguous_org_id.sql
--
-- Fix para erro 42702 ("column reference 'org_id' is ambiguous") no RPC
-- send_script_to_orgs (introduzido na migration 051). O bug:
--   A TEMP TABLE _prev_active expõe a coluna `org_id` no mesmo escopo
--   onde o INSERT/SELECT também tem RETURNING org_scripts.org_id e o
--   ON CONFLICT (org_id, script_id) — o planner não sabe qual referenciar.
--
-- Correção:
--   - Renomear coluna da TEMP TABLE pra `target_org_id` (evita colisão).
--   - Qualificar o RETURNING com prefixo da tabela.
--   - Manter previous_script_id como EXCLUDED.previous_script_id, que já
--     é unambíguo.
--
-- Idempotente. Substitui a função criada na 051.
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
  -- Snapshot do script ativo antes do close. Coluna renomeada pra
  -- target_org_id pra não colidir com org_scripts.org_id no escopo
  -- da função.
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  -- 1) Fecha qualquer associação aberta (ended_at IS NULL) das orgs alvo.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Re-envio do mesmo script reseta
  --    pra pending, renova timestamps e atualiza previous_script_id.
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
  'Fecha associações abertas + cria/atualiza pending pra cada org, registrando previous_script_id pra eventual restore no reject. Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;
