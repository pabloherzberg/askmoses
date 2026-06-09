-- ============================================================
-- 078_calls_chunking.sql
--
-- Estende calls para o pipeline de transcrição por chunks (077).
--
-- 1) Colunas de progresso:
--      chunk_total  — quantos chunks a call foi cortada (NULL = pré-chunking).
--      chunks_done  — quantos já foram transcritos (UI mostra progresso).
--
-- 2) Novos estados de processing_status pro fluxo assíncrono unificado
--    (upload manual + GHL):
--      queued_for_chunking — call criada, áudio ainda não cortado.
--      chunking            — ffmpeg cortando + enfileirando chunks.
--      awaiting_chunks     — chunks na fila, worker transcrevendo.
--      consolidating       — todos os chunks done, costurando transcript.
--    Os estados terminais existentes seguem iguais ('transcribed' é o
--    ponto de fanout pra scoring/email; 'transcription_failed' pra erro).
--
-- NÃO guardamos o áudio original: ele é cortado em memória no ingest e
-- descartado. Só os arquivos de chunk vivem (transitoriamente) no Storage.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Colunas de progresso ────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS chunk_total INT,
  ADD COLUMN IF NOT EXISTS chunks_done INT NOT NULL DEFAULT 0;

-- ─── 2. Recriar CHECK de processing_status com os novos estados ─────────────
-- Mantém todos os valores das migrations 044/046 e adiciona os de chunking.

ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_processing_status_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_processing_status_check
  CHECK (processing_status IN (
    'pending', 'processing', 'transcribed',
    'no_recording', 'transcription_failed', 'webhook_failed',
    'auth_expired',
    'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating'
  ));

-- Índice pro cron achar calls travadas no meio do pipeline (re-disparo /
-- recuperação de chunking que não decolou).
CREATE INDEX IF NOT EXISTS calls_chunking_status_idx
  ON public.calls(processing_status, updated_at)
  WHERE processing_status IN (
    'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating'
  );

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.calls_chunking_status_idx;
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_processing_status_check;
-- ALTER TABLE public.calls
--   ADD CONSTRAINT calls_processing_status_check
--   CHECK (processing_status IN (
--     'pending', 'processing', 'transcribed',
--     'no_recording', 'transcription_failed', 'webhook_failed', 'auth_expired'
--   ));
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS chunk_total,
--   DROP COLUMN IF EXISTS chunks_done;
