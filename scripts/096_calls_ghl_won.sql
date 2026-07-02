-- ============================================================
-- 096_calls_ghl_won.sql
--
-- Adiciona campos de oportunidade GHL na tabela calls:
--   ghl_opportunity_id  — id da oportunidade no GHL (para idempotência)
--   ghl_won_status      — 'won' | 'lost' | 'open' | 'abandoned' | null
--   ghl_won_at          — timestamp de quando virou 'won'
--
-- Preenchidos pelo webhook OpportunityStageChanged via contact_id.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_won_status TEXT,
  ADD COLUMN IF NOT EXISTS ghl_won_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS calls_ghl_opportunity_id_idx
  ON public.calls (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

COMMENT ON COLUMN public.calls.ghl_opportunity_id IS
  'ID da oportunidade no GHL. Preenchido via webhook OpportunityStageChanged.';
COMMENT ON COLUMN public.calls.ghl_won_status IS
  'Status da oportunidade GHL: won | lost | open | abandoned. NULL = sem oportunidade registrada.';
COMMENT ON COLUMN public.calls.ghl_won_at IS
  'Timestamp de quando o status virou won. NULL se ainda não ganhou.';
