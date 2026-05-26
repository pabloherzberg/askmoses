-- ============================================================
-- 051_org_scripts_previous_and_review_rpcs.sql
--
-- Habilita o fluxo de review pelo Owner (accept / reject):
--   - Adiciona org_scripts.previous_script_id pra rastrear qual script
--     vigorava antes do pending (necessário pra reject restaurar).
--   - Atualiza RPC send_script_to_orgs pra popular previous_script_id
--     com o script_id ativo encerrado no mesmo ato.
--   - Cria RPC accept_org_script (pending → active).
--   - Cria RPC reject_org_script (pending → rejected + restore do
--     previous_script_id pra active, ended_at=NULL).
--
-- Owner consome via /api/scripts/accept|reject (criados depois). RLS já
-- está habilitado em org_scripts (migration 044) sem policies pra anon —
-- todas as escritas passam por createAdminClient/service_role.
--
-- Idempotente.
-- ============================================================

-- ─── 1. previous_script_id ──────────────────────────────────────────────

ALTER TABLE public.org_scripts
  ADD COLUMN IF NOT EXISTS previous_script_id UUID
    REFERENCES public.scripts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_scripts.previous_script_id IS
  'Script que vigorava como active na org no momento em que este pending foi criado. NULL se a org não tinha nenhum script ativo. Usado pra restaurar no reject.';

-- ─── 2. send_script_to_orgs (atualizado pra popular previous_script_id) ──

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
  -- Captura, antes do close, qual script estava ativo em cada org alvo.
  -- Usado depois pra popular previous_script_id no novo pending.
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (org_id)
      org_id,
      script_id AS prev_script_id
    FROM public.org_scripts
    WHERE org_id = ANY(p_org_ids)
      AND status = 'active'
      AND ended_at IS NULL
    ORDER BY org_id, started_at DESC;

  -- 1) Fecha QUALQUER associação aberta (ended_at IS NULL) das orgs alvo,
  --    independente de status. Pending não-aceitos também fechados —
  --    necessário pra não violar o partial unique no INSERT abaixo.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id = ANY(p_org_ids)
     AND ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Se já existe linha pra essa
  --    combinação (re-envio do mesmo script), reseta pra pending, renova
  --    timestamps e atualiza previous_script_id pra refletir o estado
  --    atual da org no momento deste send.
  RETURN QUERY
  INSERT INTO public.org_scripts
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(org_id)
  LEFT JOIN _prev_active prev ON prev.org_id = org_input.org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    org_scripts.id,
    org_scripts.org_id,
    org_scripts.script_id,
    org_scripts.status,
    org_scripts.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org, registrando previous_script_id pra eventual restore no reject. Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── 3. accept_org_script ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  id         UUID,
  org_id     UUID,
  script_id  UUID,
  status     TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só aceita se o registro pertence à org da sessão e está pending.
  -- Sem WHERE org_id = p_org_id, um owner mal-intencionado poderia aceitar
  -- pending de outra tenant via id direto.
  RETURN QUERY
  UPDATE public.org_scripts
     SET status = 'active'
   WHERE public.org_scripts.id     = p_org_script_id
     AND public.org_scripts.org_id = p_org_id
     AND public.org_scripts.status = 'pending'
     AND public.org_scripts.ended_at IS NULL
  RETURNING
    public.org_scripts.id,
    public.org_scripts.org_id,
    public.org_scripts.script_id,
    public.org_scripts.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

-- ─── 4. reject_org_script ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reject_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  id                  UUID,
  org_id              UUID,
  script_id           UUID,
  status              TEXT,
  restored_script_id  UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_script_id UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  -- 1) Marca o pending como rejected. ended_at = now() pra encerrar o
  --    registro (sai do "current" da org).
  UPDATE public.org_scripts
     SET status   = 'rejected',
         ended_at = v_now
   WHERE public.org_scripts.id     = p_org_script_id
     AND public.org_scripts.org_id = p_org_id
     AND public.org_scripts.status = 'pending'
     AND public.org_scripts.ended_at IS NULL
  RETURNING previous_script_id INTO v_prev_script_id;

  -- Se não atualizou nada, o pending não existe / não é da org / já foi
  -- resolvido — sai sem restaurar nada. Retorna 0 rows (caller traduz).
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 2) Restaura o script anterior (se existia). Procura a linha mais
  --    recente em org_scripts pra (org_id, previous_script_id) e reabre
  --    como active. Se não havia previous, o org fica sem script — same
  --    behavior do reject puro.
  IF v_prev_script_id IS NOT NULL THEN
    UPDATE public.org_scripts
       SET status   = 'active',
           ended_at = NULL
     WHERE public.org_scripts.org_id    = p_org_id
       AND public.org_scripts.script_id = v_prev_script_id
       -- Pega a linha mais recente desse (org, script) — pode ter mais de
       -- uma se o script foi enviado, encerrado e re-enviado no passado.
       AND public.org_scripts.id = (
         SELECT inner_os.id
           FROM public.org_scripts inner_os
          WHERE inner_os.org_id    = p_org_id
            AND inner_os.script_id = v_prev_script_id
          ORDER BY inner_os.started_at DESC
          LIMIT 1
       );
  END IF;

  -- Retorna o pending atualizado + qual script foi restaurado (ou NULL).
  RETURN QUERY
  SELECT
    public.org_scripts.id,
    public.org_scripts.org_id,
    public.org_scripts.script_id,
    public.org_scripts.status,
    v_prev_script_id AS restored_script_id
  FROM public.org_scripts
  WHERE public.org_scripts.id = p_org_script_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;
