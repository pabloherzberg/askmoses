-- ============================================================
-- 087_calls_intent_decimal.sql
--
-- O calls.intent deixa de ser o "buying intent" cru 1–5 da IA (SMALLINT) e
-- passa a ser o INTENT INDEX ponderado, escala 0–5 COM decimais — exatamente o
-- mesmo cálculo do CallDetail (computeIntentIndex sobre o intent_breakdown).
--
-- Motivo: o escalar 1–5 da IA divergia do breakdown (ex.: intent 2 enquanto o
-- breakdown gerava 4.5). Agora o intent é DEFINIDO na análise (/api/analyze)
-- como computeIntentIndex(intent_breakdown, intent_weights) e persistido aqui,
-- em vez de recalculado a cada leitura.
--
-- Fórmula (idêntica a lib/utils/intentScore.ts · computeIntentIndex):
--   intent = round( (Σ score_i × peso_i) / (Σ peso_i) / 2 , 1 )
-- onde score_i ∈ 0–10 (intent_breakdown) e peso_i vem do snapshot
-- intent_weights da call (default 4/3/2/1 quando ausente). closed → 5.
--
-- Idempotente: DROP/ADD CONSTRAINT guardados; ALTER TYPE e UPDATE recomputáveis.
-- ============================================================

BEGIN;

-- 1. Remove a constraint antiga (1–5 inteiro) — o intent agora pode ser < 1 e decimal.
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_intent_range;

-- 2. SMALLINT → NUMERIC(3,2) (0.00–5.00). Cast direto preserva os inteiros legados.
ALTER TABLE public.calls
  ALTER COLUMN intent TYPE numeric(3,2) USING intent::numeric;

-- 3. Backfill: recalcula o intent das calls existentes a partir do breakdown.
--    Usa o snapshot intent_weights da call; default 4/3/2/1 quando ausente/null.
UPDATE public.calls c
SET intent = ROUND(
  (
      (c.intent_breakdown->>'financial')::numeric  * COALESCE(NULLIF(c.intent_weights->>'financial','')::numeric, 4)
    + (c.intent_breakdown->>'urgency')::numeric     * COALESCE(NULLIF(c.intent_weights->>'urgency','')::numeric, 3)
    + (c.intent_breakdown->>'authority')::numeric   * COALESCE(NULLIF(c.intent_weights->>'authority','')::numeric, 2)
    + (c.intent_breakdown->>'engagement')::numeric  * COALESCE(NULLIF(c.intent_weights->>'engagement','')::numeric, 1)
  )
  / NULLIF(
        COALESCE(NULLIF(c.intent_weights->>'financial','')::numeric, 4)
      + COALESCE(NULLIF(c.intent_weights->>'urgency','')::numeric, 3)
      + COALESCE(NULLIF(c.intent_weights->>'authority','')::numeric, 2)
      + COALESCE(NULLIF(c.intent_weights->>'engagement','')::numeric, 1)
    , 0)
  / 2
, 1)
WHERE c.intent_breakdown IS NOT NULL
  AND (c.call_outcome IS DISTINCT FROM 'closed');

-- 4. Calls fechadas sempre 5 (regra fixa, independe do breakdown).
UPDATE public.calls SET intent = 5 WHERE call_outcome = 'closed';

-- 5. Nova constraint: 0–5 decimal.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_intent_range'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_intent_range
      CHECK (intent IS NULL OR (intent >= 0 AND intent <= 5));
  END IF;
END $$;

COMMENT ON COLUMN public.calls.intent IS
  'Intent Index ponderado 0–5 (decimal) = computeIntentIndex(intent_breakdown). '
  'Definido na análise (/api/analyze) e persistido; closed é forçado a 5. '
  'Fallback por resultado em lib/utils/intent.ts quando não há breakdown.';

COMMIT;
