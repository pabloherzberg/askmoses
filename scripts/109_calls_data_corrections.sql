-- ============================================================
-- 109_calls_data_corrections.sql
--
-- Trilha de auditoria para correções manuais de dados em `calls`.
--
-- MOTIVO: os backfills históricos (043, 087, 090, 105, 108) sobrescrevem
-- valores em lugar, sem preservar o anterior. A migration 105 registra a
-- perda no próprio rollback. Sem trilha, nenhuma correção é reversível e
-- nenhuma análise histórica tem referência de antes/depois.
--
-- REGRA: todo UPDATE de correção em `calls` grava aqui a linha correspondente.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.calls_data_corrections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL REFERENCES public.calls(id),
  column_name TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  applied_by  TEXT NOT NULL,          -- nome do script, ex: '110_recalc_intent'
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_data_corrections_call_id
  ON public.calls_data_corrections (call_id);

COMMENT ON TABLE public.calls_data_corrections IS
  'Trilha de auditoria de correções manuais em calls. Toda correção de dado '
  'grava old_value/new_value aqui antes do UPDATE. Append-only por convenção.';

-- Flag de falha de scoring (§3.1). NULL = não avaliado por este gate.
-- NÃO confundir com is_sales_call: lá NULL significa "legado não classificado"
-- e é tratado como TRUE pelos filtros (ver lib/sales-calls.ts).
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS scoring_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_scoring_status_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_scoring_status_check
      CHECK (scoring_status IS NULL
             OR scoring_status IN ('ok', 'scoring_failed', 'transcript_leaked'));
  END IF;
END $$;

COMMENT ON COLUMN public.calls.scoring_status IS
  'Qualidade do scoring: ok | scoring_failed (seções/intent todos zero — falha, '
  'não avaliação) | transcript_leaked (prompt vazou no transcript). '
  'NULL = não avaliado por este gate. Consumidores de média devem excluir '
  'scoring_failed e transcript_leaked.';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_scoring_status_check;
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS scoring_status;
-- DROP TABLE IF EXISTS public.calls_data_corrections;
