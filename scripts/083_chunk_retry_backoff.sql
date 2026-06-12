-- ============================================================
-- 083_chunk_retry_backoff.sql
--
-- Retry com agendamento + teto global de concorrência na fila de chunks
-- (077/079).
--
-- Problema 1 — retry quente: quando o Whisper devolve 429 (rate limit
-- OpenAI), o chunk volta pra 'pending' imediatamente e o worker
-- auto-drenante o re-reivindica em segundos — ainda dentro da MESMA janela
-- de rate limit. As tentativas queimam todas em ~1 minuto e o chunk é
-- aposentado em 'failed', derrubando a call inteira em
-- 'transcription_failed' por uma falha transitória.
--
-- Problema 2 — concorrência sem teto: cadeias de worker se sobrepõem (kick
-- do ingest + auto-kick + cron), então a concorrência real contra a OpenAI
-- é CHUNK_BATCH × nº de cadeias vivas — foi assim que o rate limit estourou
-- em produção.
--
-- Solução:
--   a) Coluna `next_attempt_at`: ao re-enfileirar com backoff (429 →
--      1min/5min/15min; quota esgotada → 30min), o worker grava um horário
--      futuro e o claim só reivindica chunks com o horário vencido.
--   b) Parâmetro `p_max_inflight` no claim: teto GLOBAL de chunks
--      'processing' simultâneos (todas as cadeias somadas). A contagem é
--      aproximada — claims concorrentes podem ultrapassar o teto por até um
--      batch (a contagem acontece antes do UPDATE, sem lock global) — mas é
--      suficiente pra impedir o cenário de N cadeias × batch.
--
-- Chunks 'processing' stale continuam re-elegíveis pelo relógio de stale
-- (updated_at), independente de next_attempt_at — stale significa que o
-- claim morreu, não que houve backoff. Stale também não conta pro teto de
-- inflight (não há request em voo).
--
-- O default now() de next_attempt_at torna linhas existentes e novas
-- imediatamente elegíveis — comportamento idêntico ao anterior quando
-- nenhum backoff foi aplicado.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Coluna de agendamento ────────────────────────────────────────────────

ALTER TABLE public.call_chunks
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 2. claim_chunks: next_attempt_at + p_max_inflight ───────────────────────
-- A assinatura mudou (3 params); o DROP da versão antiga (079, 2 params) é
-- obrigatório — sem ele ficariam DUAS funções sobrecarregadas e o PostgREST
-- falharia com "ambiguous function" em chamadas com parâmetros nomeados.

DROP FUNCTION IF EXISTS public.claim_chunks(INT, INT);

CREATE OR REPLACE FUNCTION public.claim_chunks(
  p_batch         INT,
  p_stale_seconds INT DEFAULT 300,
  p_max_inflight  INT DEFAULT NULL
)
RETURNS SETOF public.call_chunks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slots INT := p_batch;
BEGIN
  -- Teto global: desconta os 'processing' vivos (não-stale) dos slots.
  IF p_max_inflight IS NOT NULL THEN
    SELECT LEAST(p_batch, GREATEST(p_max_inflight - COUNT(*)::INT, 0))
      INTO v_slots
      FROM public.call_chunks
     WHERE status = 'processing'
       AND updated_at >= now() - make_interval(secs => p_stale_seconds);
  END IF;

  IF v_slots <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.call_chunks c
     SET status     = 'processing',
         attempts   = c.attempts + 1,
         updated_at = now()
   WHERE c.id IN (
     SELECT q.id
       FROM public.call_chunks q
      WHERE (q.status = 'pending' AND q.next_attempt_at <= now())
         OR (q.status = 'processing'
             AND q.updated_at < now() - make_interval(secs => p_stale_seconds))
      ORDER BY q.created_at ASC
      LIMIT v_slots
      FOR UPDATE SKIP LOCKED
   )
  RETURNING c.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_chunks(INT, INT, INT) TO service_role;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.claim_chunks(INT, INT, INT);
-- Re-rodar scripts/079_claim_chunks_rpc.sql (restaura o claim de 2 params);
-- ALTER TABLE public.call_chunks DROP COLUMN IF EXISTS next_attempt_at;
