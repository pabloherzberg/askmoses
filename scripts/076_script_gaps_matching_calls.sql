-- ============================================================
-- 076_script_gaps_matching_calls.sql
--
-- Torna a coluna frequency DETERMINÍSTICA. Antes, frequency era um
-- número estimado pela IA. Agora é derivado de contagem real:
--   frequency = round(matching_call_ids.length / calls_analyzed.length * 100)
--
-- - calls_analyzed   = TODAS as calls da run (denominador)
-- - matching_call_ids = calls onde ESTE gap aparece (numerador)  ← NOVA
--
-- Aditiva e idempotente. Gaps antigos (seed da 074) ficam com
-- matching_call_ids = '[]' até a próxima run regerar.
-- ============================================================

ALTER TABLE public.script_gaps
  ADD COLUMN IF NOT EXISTS matching_call_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.script_gaps.matching_call_ids IS
  'Call IDs onde este gap específico foi observado (numerador de frequency). '
  'calls_analyzed é o denominador (todas as calls da run).';

-- Rollback (manual):
-- ALTER TABLE public.script_gaps DROP COLUMN IF EXISTS matching_call_ids;
