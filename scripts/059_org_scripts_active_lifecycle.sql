-- ============================================================
-- 057_org_scripts_active_lifecycle.sql
--
-- Conserta o ciclo de vida do active em org_scripts. send_script_to_orgs
-- (migration 050-053) fechava o active assim que um pending era enviado,
-- deixando a org sem script atual durante a janela de review — inclusive
-- em caso de reject, onde o active devia continuar sem mudança.
--
-- Regra correta (cada row é um período da vida do script na org):
--   status='active'  + ended_at IS NULL     → script ATUAL da org.
--   status='active'  + ended_at IS NOT NULL → active histórico (deprecated).
--   status='pending' + ended_at IS NULL     → proposta em review.
--   status='pending' + ended_at IS NOT NULL → proposta substituída por outra.
--   status='rejected'+ ended_at IS NOT NULL → proposta declinada pelo owner.
--
--   Active e pending COEXISTEM (1 cada por org) durante review. accept
--   fecha o active corrente (só seta ended_at, status='active' preservado);
--   reject só fecha o pending. Status do active corrente NUNCA muda via
--   send/accept/reject — só timestamps.
--
-- Mudanças:
--   1. Reverte 'superseded' (se versão anterior da 057 foi aplicada por engano)
--      pra 'active' — o modelo final não tem esse status.
--   2. Substitui partial unique único `uniq_org_scripts_open_per_org` pelo
--      par (1 active + 1 pending por org). DEVE rodar antes do backfill
--      pra evitar 23505 em orgs que já têm pending aberto.
--   3. Backfill: reabre o último active histórico de cada org que ficou sem
--      active aberto (resultado dos sends antigos).
--   4. send_script_to_orgs: cria/atualiza pending, NÃO fecha active.
--   5. accept_org_script: fecha active (só ended_at) + promove pending a active.
--   6. reject_org_script: fecha pending. Active intocado, sem restore.
--
-- Idempotente. Rode após 056.
-- ============================================================

-- ─── 1. Reverte 'superseded' se aplicado antes ──────────────────────────
-- Status final é só ('pending','active','rejected'). Se uma versão anterior
-- da 057 tinha introduzido 'superseded', revertemos antes de redeclarar
-- o CHECK.

UPDATE public.org_scripts
   SET status = 'active'
 WHERE status = 'superseded';

ALTER TABLE public.org_scripts
  DROP CONSTRAINT IF EXISTS org_scripts_status_check;

ALTER TABLE public.org_scripts
  ADD CONSTRAINT org_scripts_status_check
  CHECK (status IN ('pending', 'active', 'rejected'));

-- Drop do invariant CHECK (versão anterior da 057). Modelo novo permite
-- active|pending com ended_at IS NOT NULL como rows históricas.
ALTER TABLE public.org_scripts
  DROP CONSTRAINT IF EXISTS org_scripts_status_ended_at_invariant;

-- ─── 2. Partial uniques: 1 active + 1 pending por org ───────────────────
-- IMPORTANTE: roda ANTES do backfill que reabre active. Caso contrário,
-- orgs que já têm pending aberto (e estamos prestes a reabrir o active)
-- violariam o partial unique antigo (1 row aberta por org, sem distinção
-- de status).

DROP INDEX IF EXISTS public.uniq_org_scripts_open_per_org;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_active_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_pending_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL AND status = 'pending';

-- ─── 3. Reabre o último active de cada org sem active aberto ────────────

UPDATE public.org_scripts AS reopen
   SET ended_at = NULL
  FROM (
    SELECT DISTINCT ON (os.org_id)
      os.id
    FROM public.org_scripts os
    WHERE os.status = 'active'
      AND os.ended_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.org_scripts cur
        WHERE cur.org_id = os.org_id
          AND cur.status = 'active'
          AND cur.ended_at IS NULL
      )
    ORDER BY os.org_id, os.ended_at DESC
  ) AS pick
 WHERE reopen.id = pick.id;

-- ─── 4. send_script_to_orgs — NÃO fecha active ──────────────────────────

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
  -- Snapshot do active corrente por org → previous_script_id da proposta.
  CREATE TEMP TABLE _curr_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  -- Fecha pending anterior (admin envia outra proposta antes da revisão).
  -- Active corrente fica intocado.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.status = 'pending'
     AND os.ended_at IS NULL;

  -- Upsert do novo pending. ON CONFLICT (org, script):
  --   - Se a row existente é o active corrente da org, no-op
  --     (send do mesmo script atual não faz sentido).
  --   - Senão, reseta pra pending (renova started_at, zera ended_at).
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
  LEFT JOIN _curr_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
    WHERE NOT (tgt.status = 'active' AND tgt.ended_at IS NULL)
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Cria/atualiza pending por org. NÃO fecha active corrente. Fecha pending anterior se existir.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── 5. accept_org_script — fecha active + promove pending ──────────────

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
  -- Fecha active corrente: status='active' preservado, só seta ended_at.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = p_org_id
     AND os.status = 'active'
     AND os.ended_at IS NULL;

  -- Promove pending → active.
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
  'Fecha active corrente (só ended_at) + promove pending a active. Status do active anterior preservado.';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

-- ─── 6. reject_org_script — fecha pending, active intocado ──────────────
-- previous_script_id segue na coluna (compat com caller TS) mas não é mais
-- usado pra restore: active corrente nunca foi fechado, não há o que restaurar.

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
  v_now TIMESTAMPTZ := now();
BEGIN
  RETURN QUERY
  WITH rejected AS (
    UPDATE public.org_scripts AS os
       SET status   = 'rejected',
           ended_at = v_now
     WHERE os.id     = p_org_script_id
       AND os.org_id = p_org_id
       AND os.status = 'pending'
       AND os.ended_at IS NULL
    RETURNING os.id, os.org_id, os.script_id, os.status, os.previous_script_id
  )
  SELECT
    r.id,
    r.org_id,
    r.script_id,
    r.status,
    r.previous_script_id
  FROM rejected r;
END;
$$;

COMMENT ON FUNCTION public.reject_org_script IS
  'Fecha pending como rejected. Active corrente da org não é tocado.';

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;
