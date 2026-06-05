-- ============================================================
-- 073_calls_intent.sql
--
-- Adiciona calls.intent — "buying intent" (1–5) detectado pela IA no /api/analyze.
--
-- NULL em calls anteriores a esta migration (e em ingestões que ainda não
-- produzem intent). O mapper DbCall→Call (lib/services/calls.ts · toCall) trata
-- NULL caindo num default por resultado (lib/utils/intent.ts · resolveIntent);
-- `closed` é sempre forçado a 5 na escrita/leitura.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CHECK guardado por pg_constraint.
-- O CHECK entra NOT VALID pra não falhar caso exista linha legada fora do range
-- (não deveria, já que a coluna nasce NULL).
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS intent SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_intent_range'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_intent_range
      CHECK (intent IS NULL OR (intent BETWEEN 1 AND 5))
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.calls VALIDATE CONSTRAINT calls_intent_range;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'calls_intent_range não validada: %', SQLERRM;
END $$;

COMMENT ON COLUMN public.calls.intent IS
  'Buying intent 1–5 detectado pela IA (analyze). NULL em calls pré-073; '
  'closed é forçado a 5. Fallback por resultado em lib/utils/intent.ts.';
