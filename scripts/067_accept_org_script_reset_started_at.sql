-- ============================================================
-- 067_accept_org_script_reset_started_at.sql
--
-- Conserta `accept_org_script` (redefinida em 066) pra também atualizar
-- `started_at = now()` no momento da promoção pending → active.
--
-- Sem este fix, o `started_at` da row preservava o timestamp de quando o
-- pending FOI ENVIADO — então quando consumers (org_scripts_current,
-- list_admin_organizations) ordenam por `started_at DESC` e leem o
-- "início" do active, eles veem uma data anterior ao aceite (a data do
-- envio). UI ficava mostrando "iniciado em [data antiga]" pra um active
-- que tinha acabado de ser promovido.
--
-- Mantém todo o comportamento da 066 (fecha linhas abertas anteriores
-- antes de ativar o pending). Única adição: `started_at = v_now` no
-- UPDATE de promoção.
--
-- Idempotente (CREATE OR REPLACE). Rode após 066.
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
  -- Garante invariante: 1 linha com ended_at IS NULL por org após o accept
  -- (herdado da 066).
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id   = p_org_id
     AND id      <> p_org_script_id
     AND ended_at IS NULL;

  -- Promove pending → active. started_at reseta pra v_now: representa
  -- "quando este script começou a vigorar como active da org", coerente
  -- com o uso em org_scripts_current / list_admin_organizations.
  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status     = 'active',
         started_at = v_now
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
  'Aceita pending: fecha linhas abertas anteriores (066) + promove pending a active com started_at = now() (067). Garante invariante de 1 row aberta por org e started_at coerente.';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;
