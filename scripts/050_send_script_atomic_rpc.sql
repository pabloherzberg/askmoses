-- ============================================================
-- 050_send_script_atomic_rpc.sql
--
-- RPC transacional pro POST /api/admin/scripts/send. Antes o endpoint
-- fazia UPDATE (fechar abertas) + UPSERT (criar pending) em duas chamadas
-- separadas — se a 2ª falhasse por erro não-23505 (network/PostgREST/etc),
-- as orgs ficavam sem script corrente, dropando silenciosamente o script
-- atual delas.
--
-- send_script_to_orgs roda close + upsert dentro de uma transação única.
-- Falha de qualquer parte → rollback completo, invariante "1 script
-- corrente por org" preservado.
--
-- 23505 (violação do partial unique uniq_org_scripts_open_per_org) ainda
-- pode acontecer em race entre dois admins concorrentes — propaga pro
-- caller traduzir em HTTP 409.
--
-- Idempotente. Rode após 046 (que cria o partial unique).
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
  -- 1) Fecha QUALQUER associação aberta (ended_at IS NULL) das orgs alvo,
  --    independente de status. Pending não-aceitos também fechados —
  --    necessário pra não violar o partial unique no INSERT abaixo.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id = ANY(p_org_ids)
     AND ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Se já existe linha pra essa
  --    combinação (re-envio do mesmo script), reseta pra pending e renova
  --    started_at/sent_by/ended_at=null.
  RETURN QUERY
  INSERT INTO public.org_scripts
    (org_id, script_id, status, started_at, ended_at, sent_by)
  SELECT
    unnest(p_org_ids),
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status     = 'pending',
        started_at = v_now,
        ended_at   = NULL,
        sent_by    = p_sent_by
  RETURNING
    org_scripts.id,
    org_scripts.org_id,
    org_scripts.script_id,
    org_scripts.status,
    org_scripts.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org. Tudo em uma transação.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;
