-- ============================================================
-- 083_chunk_retry_backoff.sql
--
-- Retry com agendamento na fila de chunks (077/079).
--
-- Problema: quando o Whisper devolve 429 (rate limit OpenAI), o chunk volta
-- pra 'pending' imediatamente e o worker auto-drenante o re-reivindica em
-- segundos — ainda dentro da MESMA janela de rate limit. As tentativas
-- queimam todas em ~1 minuto e o chunk é aposentado em 'failed', derrubando
-- a call inteira em 'transcription_failed' por uma falha transitória.
--
-- Solução: coluna `next_attempt_at` em call_chunks. Ao re-enfileirar com
-- backoff (429 → 1min/5min/15min; quota esgotada → 30min), o worker grava
-- um horário futuro e o claim só reivindica chunks com next_attempt_at já
-- vencido. Chunks 'processing' stale continuam re-elegíveis pelo relógio de
-- stale (updated_at), independente de next_attempt_at — stale significa que
-- o claim morreu, não que houve backoff.
--
-- O default now() torna as linhas existentes (e as novas, inseridas sem a
-- coluna) imediatamente elegíveis — comportamento idêntico ao anterior
-- quando nenhum backoff foi aplicado.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Coluna de agendamento ────────────────────────────────────────────────

ALTER TABLE public.call_chunks
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── 2. claim_chunks respeitando next_attempt_at ─────────────────────────────
-- Mesma assinatura do 079 (CREATE OR REPLACE preserva grants); única mudança
-- é o filtro `next_attempt_at <= now()` no ramo 'pending'.

CREATE OR REPLACE FUNCTION public.claim_chunks(
  p_batch         INT,
  p_stale_seconds INT DEFAULT 300
)
RETURNS SETOF public.call_chunks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
      LIMIT p_batch
      FOR UPDATE SKIP LOCKED
   )
  RETURNING c.*;
END;
$$;

-- Grants re-aplicados por segurança (idempotente; CREATE OR REPLACE com a
-- mesma assinatura já os preserva).
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_chunks(INT, INT) TO service_role;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- Re-rodar scripts/079_claim_chunks_rpc.sql (restaura o claim sem o filtro);
-- ALTER TABLE public.call_chunks DROP COLUMN IF EXISTS next_attempt_at;
