-- ============================================================
-- 079_claim_chunks_rpc.sql
--
-- Claim atômico da fila de chunks (077). O worker roda no Vercel Cron e
-- pode ter execuções concorrentes/sobrepostas; sem trava, dois runs pegam
-- o mesmo chunk e transcrevem duas vezes (custo dobrado + corrida na
-- consolidação).
--
-- `claim_chunks(p_batch, p_stale_seconds)`:
--   - Seleciona até p_batch chunks elegíveis com FOR UPDATE SKIP LOCKED —
--     runs concorrentes pulam linhas já travadas, nunca colidem.
--   - Elegível = status 'pending' OU 'processing' parado há mais de
--     p_stale_seconds (recuperação: função morreu sem marcar done/failed).
--   - Marca os escolhidos como 'processing', incrementa attempts e
--     atualiza updated_at (reinicia o relógio de stale).
--   - Retorna as linhas reivindicadas pro worker transcrever.
--
-- attempts++ acontece no claim (não no fim): garante que um chunk que
-- crasha repetidamente no meio do processamento ainda conta tentativas e
-- eventualmente é aposentado em 'failed' pelo worker, em vez de rodar pra
-- sempre.
--
-- Segurança: SECURITY DEFINER + search_path fixo (padrão do 032). REVOKE de
-- PUBLIC/anon/authenticated — só service_role (admin client das rotas) chama.
--
-- Idempotente — CREATE OR REPLACE.
-- ============================================================

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
      WHERE q.status = 'pending'
         OR (q.status = 'processing'
             AND q.updated_at < now() - make_interval(secs => p_stale_seconds))
      ORDER BY q.created_at ASC
      LIMIT p_batch
      FOR UPDATE SKIP LOCKED
   )
  RETURNING c.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_chunks(INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_chunks(INT, INT) TO service_role;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.claim_chunks(INT, INT);
