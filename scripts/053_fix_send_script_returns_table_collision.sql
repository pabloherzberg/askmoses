-- ============================================================
-- 053_fix_send_script_returns_table_collision.sql
--
-- Fix definitivo para o erro 42702 no RPC send_script_to_orgs.
-- A 052 corrigiu uma colisão na TEMP TABLE mas o erro persistia porque
-- a raiz é OUTRA: RETURNS TABLE(org_id UUID, script_id UUID, ...) declara
-- variáveis OUT implícitas no escopo da função com os mesmos nomes das
-- colunas de org_scripts. Quando o INSERT roda dentro do RETURN QUERY,
-- toda referência a `org_id` / `script_id` / `status` / `started_at`
-- (no SELECT, no ON CONFLICT, no SET) é ambígua: é a coluna da tabela
-- ou a variável OUT?
--
-- Correção: renomear todas as colunas do RETURNS TABLE com prefixo
-- `out_`, eliminando a colisão.
--
-- O endpoint que chama a função consome o resultado por posição (não
-- por nome de coluna no JSON do RPC) — o supabase-js retorna os campos
-- com os nomes do RETURNS TABLE, então o caller TS precisa ser atualizado
-- também pra ler `out_id`, `out_org_id`, etc.
--
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  out_id          UUID,
  out_org_id      UUID,
  out_script_id   UUID,
  out_status      TEXT,
  out_started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

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

-- ─── Mesmo fix nos outros 2 RPCs criados na 051 ──────────────────────────
-- accept_org_script e reject_org_script têm o mesmo padrão RETURNS TABLE
-- com nomes idênticos a colunas — vão dar o mesmo 42702 quando chamados.

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
BEGIN
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

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

DROP FUNCTION IF EXISTS public.reject_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id                  UUID,
  out_org_id              UUID,
  out_script_id           UUID,
  out_status              TEXT,
  out_restored_script_id  UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_script_id UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  UPDATE public.org_scripts AS os
     SET status   = 'rejected',
         ended_at = v_now
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING os.previous_script_id INTO v_prev_script_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_prev_script_id IS NOT NULL THEN
    UPDATE public.org_scripts AS os
       SET status   = 'active',
           ended_at = NULL
     WHERE os.org_id    = p_org_id
       AND os.script_id = v_prev_script_id
       AND os.id = (
         SELECT inner_os.id
           FROM public.org_scripts inner_os
          WHERE inner_os.org_id    = p_org_id
            AND inner_os.script_id = v_prev_script_id
          ORDER BY inner_os.started_at DESC
          LIMIT 1
       );
  END IF;

  RETURN QUERY
  SELECT
    os.id,
    os.org_id,
    os.script_id,
    os.status,
    v_prev_script_id
  FROM public.org_scripts os
  WHERE os.id = p_org_script_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;
