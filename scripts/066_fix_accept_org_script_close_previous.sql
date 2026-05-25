-- ============================================================
-- 066_fix_accept_org_script_close_previous.sql
--
-- A accept_org_script só fazia SET status='active' na linha pending,
-- sem fechar a linha active anterior. Resultado: duas linhas com
-- ended_at IS NULL na mesma org → DISTINCT ON na RPC list_admin_organizations
-- pegava a linha errada e mostrava status incorreto no painel admin.
--
-- Fix: antes de ativar o pending, fecha todas as outras linhas abertas
-- da mesma org (ended_at IS NULL AND id <> p_org_script_id).
--
-- Idempotente. Rode após 065.
-- ============================================================

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id         UUID,
  out_org_id     UUID,
  out_script_id  UUID,
  out_status     TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fecha todas as outras linhas abertas da org antes de ativar o pending.
  -- Garante invariante: 1 linha com ended_at IS NULL por org após o accept.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id   = p_org_id
     AND id      <> p_org_script_id
     AND ended_at IS NULL;

  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status = 'active'
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING
    os.id,
    os.org_id,
    os.script_id,
    os.status;
END;
$$;

COMMENT ON FUNCTION public.accept_org_script IS
  'Aceita um script pending: fecha linhas abertas anteriores da org e ativa o pending. '
  'Garante invariante de 1 linha aberta por org após o accept (fix 066).';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;
