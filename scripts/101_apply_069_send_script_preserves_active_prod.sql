-- ============================================================
-- 101_apply_069_send_script_preserves_active_prod.sql
--
-- A migration 069_send_script_preserves_active.sql (que corrige
-- send_script_to_orgs pra NUNCA fechar o script 'active' da org ao enviar
-- uma nova sugestão) existia no repositório mas nunca tinha sido aplicada
-- no banco de produção — o banco real ainda rodava a versão com bug da
-- migration 065, que fecha QUALQUER linha aberta (status='active' incluso)
-- ao chamar send_script_to_orgs.
--
-- Isso foi descoberto quando a automação semanal de sugestão de script
-- (lib/script-intelligence/weekly-suggestion.ts) rodou pela primeira vez:
-- o script ATIVO de todas as organizações "sumiu" (ficou com ended_at
-- setado) assim que a sugestão nova foi enviada — quebrando o fluxo
-- esperado de "owner vê o script atual à esquerda e a sugestão à direita
-- no Script Intelligence, e decide se substitui".
--
-- Esta migration:
--   1. Reaplica o conteúdo exato da 069 (idempotente, CREATE OR REPLACE).
--   2. Roda o backfill defensivo já incluso na 069 (reabre qualquer
--      'active' fechado indevidamente que não tenha outro active aberto
--      na mesma org).
--   3. Reabre pontualmente por ID as 5 linhas confirmadas fechadas pelo
--      bug nesta sessão (Centurion K9, Stay Focused Dog Training LLC,
--      AskMoses Demo Org, Unleashed Consulting 1A, e a 5ª org criada em
--      sessão anterior) — redundante com o passo 2, mas explícito.
--
-- Rode este arquivo direto no SQL Editor do Supabase (projeto de
-- produção) — não há CLI/psql configurado neste ambiente para aplicar
-- migrations automaticamente.
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
  -- Snapshot do active corrente por org → previous_script_id.
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

  -- 1) Fecha SÓ pending anterior, se houver. Active nunca é tocado aqui.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.status = 'pending'
     AND os.ended_at IS NULL;

  -- 2) Upsert do novo pending.
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
  'Cria/atualiza pending por org. Active corrente NÃO é tocado (ended_at preservado). Fecha pending anterior (mantém status=''pending'' e seta ended_at). Snapshot do previous via fallback (org_scripts ativo → scripts.is_active). RETURNS TABLE com prefixo out_* (pro caller TS). Fix de 069 sobre 065 — aplicado retroativamente em produção via 101.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── Backfill defensivo (idêntico ao já incluso na 069) ────────────────────
-- Reabre active que foi fechado indevidamente pelo bug da 065: qualquer row
-- status='active' com ended_at NÃO-NULL onde a org não tem outro active
-- aberto. Pega o mais recentemente fechado. Idempotente.

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

-- ─── Reabertura pontual das 5 linhas confirmadas nesta sessão ──────────────
-- Redundante com o backfill acima, mas explícito e verificável por ID.

UPDATE public.org_scripts
   SET ended_at = NULL
 WHERE id IN (
   '6ab47de1-53f3-44ab-afe1-c0c0a894fdef', -- Centurion K9
   '4876853d-eda8-45d7-9c23-cc50b33b3044', -- Stay Focused Dog Training LLC
   '1f85ced1-d021-4440-9c7a-088ffd16d861', -- AskMoses Demo Org
   '231d6452-dbd0-4f98-846e-1a8fe4724e79', -- Unleashed Consulting 1A
   '6b36652c-02b0-4e88-bbd9-cb38fe144803'  -- 5ª org
 )
 AND status = 'active';

-- ─── Verificação ────────────────────────────────────────────────────────────
-- Rode esta query depois e confirme que cada org aparece 1x com
-- status='active' e ended_at=NULL, e 1x com status='pending' e ended_at=NULL
-- (a sugestão aguardando decisão do owner).

SELECT org_id, script_id, status, ended_at
FROM public.org_scripts
ORDER BY org_id, status;
