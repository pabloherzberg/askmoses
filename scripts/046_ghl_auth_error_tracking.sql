-- ============================================================
-- 046_ghl_auth_error_tracking.sql
--
-- Suporta detecção de PIT (Private Integration Token) rotacionado
-- no Pepper. Quando o owner da location GHL rotaciona o token,
-- nossa cópia em organizations.ghl_access_token vira inválida e
-- chamadas subsequentes pra GHL API retornam 401.
--
-- Mudanças:
--   1) Novo processing_status 'auth_expired' em calls (substitui
--      o catch-all 'no_recording' / 'transcription_failed' quando
--      a causa real é 401/403 da GHL).
--   2) Coluna ghl_last_auth_error_at em organizations: timestamp
--      da última falha de auth detectada. Usado pelo banner no
--      admin UI pra avisar que o token precisa ser atualizado.
--      Limpa automaticamente quando admin cola um token novo.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Recriar CHECK constraint incluindo 'auth_expired' ──────────────────
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_processing_status_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_processing_status_check
  CHECK (processing_status IN (
    'pending', 'processing', 'transcribed',
    'no_recording', 'transcription_failed', 'webhook_failed',
    'auth_expired'
  ));

-- ─── 2. Coluna pra rastrear última falha de auth na org ────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_last_auth_error_at TIMESTAMPTZ;

-- ─── Rollback (manual) ────────────────────────────────────────────────────
-- ALTER TABLE public.calls
--   DROP CONSTRAINT IF EXISTS calls_processing_status_check;
-- ALTER TABLE public.calls
--   ADD CONSTRAINT calls_processing_status_check
--   CHECK (processing_status IN (
--     'pending', 'processing', 'transcribed',
--     'no_recording', 'transcription_failed', 'webhook_failed'
--   ));
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS ghl_last_auth_error_at;
