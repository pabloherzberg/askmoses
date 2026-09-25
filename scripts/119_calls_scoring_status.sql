-- ============================================================
-- 119_calls_scoring_status.sql
--
-- Flag de qualidade do scoring em `calls`.
--
-- A tabela calls_data_corrections (versionada em 116a) e esta coluna foram
-- criadas juntas, à mão, no SQL Editor, no mesmo script anterior a
-- 17/09/2026 — ver a nota em 116a. Este arquivo versiona só a metade que a
-- 116a deixou de fora: a coluna scoring_status em `calls`.
--
-- MOTIVO: seções ou intent zerados (falha de scoring) e transcript vazado
-- (prompt do Whisper ecoado — ver guard da 110/whisper.ts) não são avaliação
-- real. Sem uma flag, ficam misturados com scores legítimos e distorcem
-- médias (§3 do checklist de correções). NULL = não avaliado por este gate
-- — não confundir com is_sales_call, onde NULL tem semântica oposta (tratado
-- como true pelos filtros, ver lib/sales-calls.ts).
--
-- Idempotente: ADD COLUMN/CONSTRAINT IF NOT EXISTS. Em prod, rodar este
-- arquivo não muda nada — a coluna já existe.
-- ============================================================

BEGIN;

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
-- (não rodar em prod — calls já tem correções 113/115 dependentes desta coluna)
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_scoring_status_check;
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS scoring_status;
