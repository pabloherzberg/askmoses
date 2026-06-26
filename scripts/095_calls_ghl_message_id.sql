-- ============================================================
-- 095_calls_ghl_message_id.sql
--
-- Adiciona calls.ghl_message_id — o id da MENSAGEM de call no GHL (retornado
-- por fetchRecordingUrl via Conversations API). É a identidade REAL da
-- gravação e a base de um dedup robusto no pipeline.
--
-- Motivo: o external_call_id (hash de contactId|userId|callStatus|
-- callDirection|duration) inclui a duração. O GHL costuma entregar a mesma
-- call duas vezes (primeiro sem duração, depois com a duração assíncrona) — os
-- hashes divergem e a call era analisada e faturada DUAS vezes. O messageId é
-- o mesmo nas duas entregas; uma UNIQUE (org, ghl_message_id) garante que a
-- mesma gravação só vira UMA call analisada.
--
-- O messageId só é conhecido DENTRO do pipeline (após consultar a Conversations
-- API), então a trava é aplicada lá (dbClaimGhlMessageId), não no upsert do
-- webhook. Sem backfill: calls antigas seguem com ghl_message_id NULL (o índice
-- parcial as ignora).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + índice IF NOT EXISTS.
-- ============================================================

BEGIN;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS ghl_message_id TEXT;

-- Trava idempotente por org: a mesma gravação (messageId) não pode virar duas
-- calls. Parcial (só não-nulos) — não restringe calls sem origem GHL.
CREATE UNIQUE INDEX IF NOT EXISTS calls_org_ghl_message_id_uniq
  ON public.calls(org_id, ghl_message_id)
  WHERE ghl_message_id IS NOT NULL;

COMMENT ON COLUMN public.calls.ghl_message_id IS
  'Id da mensagem de call no GHL (Conversations API). Identidade real da '
  'gravação; UNIQUE (org, ghl_message_id) deduplica reentregas do webhook.';

COMMIT;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.calls_org_ghl_message_id_uniq;
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS ghl_message_id;
