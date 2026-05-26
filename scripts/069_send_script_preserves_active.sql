-- ============================================================
-- 069_send_script_preserves_active.sql
--
-- BUG: A migration 065 (último redefinição de send_script_to_orgs) fecha
-- TODAS as rows com ended_at IS NULL ao receber um novo script, inclusive
-- o status='active'. Resultado: assim que o Admin envia um novo script
-- pra revisão, a org perde o script ativo até que o Owner aceite — e se
-- o Owner rejeitar, fica permanentemente sem ativo.
--
-- Regra correta do lifecycle (mesma definida em 059, perdida em 065):
--
--   send (Admin):
--     - Fecha pending anterior se existir (status='pending' + ended_at=now).
--     - Active da org INTOCADO (ended_at permanece NULL).
--     - Cria pending novo (status='pending', ended_at=NULL).
--
--   accept (Owner):
--     - Aí sim fecha o active (ended_at=now) + promove pending → active.
--     - (Lógica em accept_org_script — migrations 066+067).
--
--   reject (Owner):
--     - Fecha só o pending (status='rejected', ended_at=now).
--     - Active intocado.
--     - (Lógica em reject_org_script — migration 059).
--
-- Esta migration restaura essa semântica em send_script_to_orgs preservando
-- o que a 065 trouxe: prefixo out_* no RETURNS TABLE (necessário pro caller
-- TS ler rowByOrgId) e fallback scripts.is_active no snapshot do previous.
--
-- Idempotente (CREATE OR REPLACE). Rode após 067/068.
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
  -- ─── Snapshot do active corrente por org → previous_script_id ──────────
  -- Prioridade 1: org_scripts.status='active' AND ended_at IS NULL.
  -- Prioridade 2: scripts.is_active=true (fallback pra orgs sem linha em
  --   org_scripts — mesmo fallback usado por dbGetActiveOrgScript pós-fix).
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (combined.target_org_id)
      combined.target_org_id,
      combined.prev_script_id,
      combined.priority
    FROM (
      SELECT
        os.org_id    AS target_org_id,
        os.script_id AS prev_script_id,
        1            AS priority
      FROM public.org_scripts os
      WHERE os.org_id = ANY(p_org_ids)
        AND os.status = 'active'
        AND os.ended_at IS NULL

      UNION ALL

      SELECT
        s.org_id     AS target_org_id,
        s.id         AS prev_script_id,
        2            AS priority
      FROM public.scripts s
      WHERE s.org_id = ANY(p_org_ids)
        AND s.is_active = true
    ) combined
    ORDER BY combined.target_org_id, combined.priority ASC;

  -- ─── 1) Fecha pending anterior, SE houver ──────────────────────────────
  -- Só pending: Admin enviando outra proposta antes do Owner revisar a
  -- anterior substitui a proposta, não o active. Active mantém ended_at
  -- IS NULL até accept_org_script chamar (e só então).
  --
  -- Status fica 'pending' no close (não 'rejected') — 'rejected' é
  -- reservado pra ação explícita do Owner via reject_org_script.
  -- A row "pending + ended_at NOT NULL" = proposta substituída sem revisão
  -- (semântica documentada em 059:13).
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.status = 'pending'
     AND os.ended_at IS NULL;

  -- ─── 2) Upsert do novo pending ─────────────────────────────────────────
  -- ON CONFLICT (org_id, script_id):
  --   - Se a row existente é o active corrente da org, NO-OP (não vira
  --     pending — Admin re-enviar o mesmo script atual não tem efeito).
  --   - Senão (rejected antigo, active fechado de versões passadas, etc.),
  --     reseta pra pending novo (renova started_at, zera ended_at).
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
  'Cria/atualiza pending por org. Active corrente NÃO é tocado (ended_at preservado). Fecha pending anterior como rejected. Snapshot do previous via fallback (org_scripts ativo → scripts.is_active). RETURNS TABLE com prefixo out_* (pro caller TS). Fix de 069 sobre 065.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── Backfill defensivo ──────────────────────────────────────────────────
-- Reabre active que foi fechado indevidamente pelo bug da 065: qualquer
-- row status='active' com ended_at NÃO-NULL onde a org não tem outro
-- active aberto. Pega o mais recentemente fechado. Idempotente.

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
