-- ============================================================
-- 096_calls_unlinked_trainer.sql
--
-- Vincula calls da GHL apenas a membros ATIVOS (vinculados ao GHLUSERID e com
-- invite aceito). O webhook resolve o vendedor por (org_id, ghl_user_id):
--   • vinculado + invite aceito → analisa normalmente (trainer_id setado);
--   • sem vínculo, ou invite pendente → call entra BLOQUEADA, sem gastar
--     download/Whisper/LLM, e visível pro owner ("CALL FEITA POR X").
--
-- Esta migration adiciona o que falta no banco:
--   1) calls.ghl_user_id — o GHLUSERID que fez a call (do payload). Guardado
--      sempre (linkada ou não) para atribuição e para a recuperação automática
--      achar as calls bloqueadas de um GHLUSERID quando ele for vinculado/aceito.
--   2) Novo processing_status 'unlinked_trainer' — estado terminal-mas-recuperável
--      das calls bloqueadas. Recriado o CHECK mantendo todos os estados de 078.
--   3) Índice parcial pra recuperação: acha rápido as bloqueadas de um GHLUSERID.
--
-- Sem backfill: calls antigas seguem com ghl_user_id NULL.
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

BEGIN;

-- ─── 1. Coluna do GHLUSERID que originou a call ─────────────────────────────
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS ghl_user_id TEXT;

COMMENT ON COLUMN public.calls.ghl_user_id IS
  'GHLUSERID (payload.userId) que fez a call. Base da atribuição ao membro e '
  'da recuperação automática de calls bloqueadas (processing_status=unlinked_trainer).';

-- ─── 2. Recriar CHECK de processing_status com 'unlinked_trainer' ───────────
-- Mantém todos os valores das migrations 044/046/078 e adiciona o novo estado.
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_processing_status_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_processing_status_check
  CHECK (processing_status IN (
    'pending', 'processing', 'transcribed',
    'no_recording', 'transcription_failed', 'webhook_failed',
    'auth_expired',
    'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating',
    'unlinked_trainer'
  ));

-- ─── 3. Índice de recuperação ───────────────────────────────────────────────
-- Quando um GHLUSERID é vinculado a um membro ativo (ou o membro aceita o
-- invite), buscamos as calls bloqueadas desse GHLUSERID pra reprocessar.
CREATE INDEX IF NOT EXISTS calls_unlinked_ghl_user_id_idx
  ON public.calls(org_id, ghl_user_id)
  WHERE processing_status = 'unlinked_trainer';

COMMIT;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.calls_unlinked_ghl_user_id_idx;
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_processing_status_check;
-- ALTER TABLE public.calls
--   ADD CONSTRAINT calls_processing_status_check
--   CHECK (processing_status IN (
--     'pending', 'processing', 'transcribed',
--     'no_recording', 'transcription_failed', 'webhook_failed', 'auth_expired',
--     'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating'
--   ));
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS ghl_user_id;
