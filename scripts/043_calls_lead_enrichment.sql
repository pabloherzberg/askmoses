-- ============================================================
-- 043_calls_lead_enrichment.sql
--
-- Adiciona campos de enriquecimento de lead vindos do webhook
-- GHL/Pepper CRM à tabela calls:
--   lead_name    TEXT  — nome do lead recebido do CRM (pode ser NULL)
--   lead_source  TEXT  — canal de aquisição (facebook/google/organic/
--                        referral/other), normalizado pelo /api/analyze
--
-- Problema que resolve:
--   lib/db/calls.ts (dbCreateCall) já insere lead_name e lead_source
--   no payload da call, mas as colunas nunca foram adicionadas ao
--   schema — toda chamada a /api/analyze quebra em prod com
--   "Could not find the 'lead_source' column of 'calls' in the
--   schema cache" (hotfix prod 2026-05-15).
--
-- CHECK constraint: protege contra writes diretos que pulem a
--   normalização do /api/analyze (route.ts:519-524). Valores devem
--   bater com LEAD_SOURCES em lib/constants.ts:52-58.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS lead_name   TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calls_lead_source_check'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_lead_source_check
      CHECK (lead_source IS NULL OR lead_source IN
        ('facebook', 'google', 'organic', 'referral', 'other'));
  END IF;
END$$;

-- Rollback (manual):
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_lead_source_check;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS lead_name,
--   DROP COLUMN IF EXISTS lead_source;
