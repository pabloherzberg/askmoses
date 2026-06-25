-- ============================================================
-- 091_calls_contact_id.sql
--
-- Promove o contactId do GHL (hoje preso dentro de ghl_payload->customData)
-- para uma COLUNA indexada calls.contact_id.
--
-- Motivo: precisamos juntar calls a (a) agendamentos da agenda GHL — visão
-- "agendados hoje" do owner — e (b) o evento de paying client (Stage 2), ambos
-- por contactId. Extrair do JSONB a cada query é lento e verboso.
--
-- Backfill: extrai de ghl_payload->'customData'->>'contactId' (estrutura
-- gravada pelo webhook em app/api/webhooks/ghl/route.ts — rawBody inteiro).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + índice IF NOT EXISTS; backfill só
-- preenche linhas com contact_id ainda NULL.
-- ============================================================

BEGIN;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS contact_id TEXT;

-- Backfill a partir do payload preservado.
UPDATE public.calls
SET contact_id = ghl_payload->'customData'->>'contactId'
WHERE contact_id IS NULL
  AND ghl_payload->'customData'->>'contactId' IS NOT NULL;

-- Índice por (org, contato) — usado nos joins de appointments e Stage 2.
CREATE INDEX IF NOT EXISTS calls_org_contact_idx
  ON public.calls(org_id, contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN public.calls.contact_id IS
  'GHL contactId promovido de ghl_payload->customData. Usado para juntar '
  'calls a appointments (agenda GHL) e ao evento de paying client (Stage 2).';

COMMIT;
