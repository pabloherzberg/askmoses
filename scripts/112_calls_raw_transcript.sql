-- ============================================================
-- 112_calls_raw_transcript.sql
--
-- Preserva o transcript bruto (pré-diarização) em `calls.raw_transcript`.
--
-- NOTA: originalmente numerada 110. Renumerada durante o merge com dev
-- (2026-09-25), que já ocupava 110 (call_chunks_transcript_quality) com uma
-- migration não relacionada (guard de saída degenerada em call_chunks). Já
-- aplicada em produção sob o nome antigo antes da renumeração — o SQL em
-- si é idempotente (ADD COLUMN IF NOT EXISTS), então reaplicar sob este
-- arquivo não tem efeito.
--
-- MOTIVO: hoje o pipeline (chunk-pipeline.ts finalizeCallIfReady) grava só o
-- resultado diarizado em `calls.transcript` e IMEDIATAMENTE apaga os chunks
-- brutos (dbClearChunkPayloads + deleteAllChunkAudioForCall). Se a diarização
-- devolver lixo (eco do prompt — ver checklist §3.2), não sobra nenhuma cópia
-- do texto original pra recuperar; o dado é perdido para sempre.
--
-- Com a validação anti-eco (§3.2.1) e o guard de saída degenerada da 110
-- (dev), esse caso já fica raro, mas persistir o bruto ANTES de limpar os
-- chunks é a defesa que fecha o risco de vez — mesmo uma falha de validação
-- futura não descarta o dado original.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

BEGIN;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS raw_transcript TEXT;

COMMENT ON COLUMN public.calls.raw_transcript IS
  'Transcript bruto, pré-diarização (concatenação dos chunks, sem speaker '
  'labels). Gravado antes de limpar call_chunks, como salvaguarda contra '
  'vazamento/corrupção no passo de diarização (ver checklist §3.2). NULL '
  'para calls processadas antes desta coluna existir.';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS raw_transcript;
