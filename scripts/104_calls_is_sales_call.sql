-- ============================================================
-- 104_calls_is_sales_call.sql
--
-- Gate de classificação adicionado ANTES do resto do pipeline de análise:
-- "isso é uma call de venda?". Quando false, a call é persistida com a
-- transcrição mas SEM nenhum dado de análise (sem scores, sem
-- strengths/improvements, sem detectedOutcome).
--
-- Nullable: calls já analisadas antes desta migration ficam com
-- is_sales_call = NULL, significando "não classificado" — diferente de
-- false. Consumidores de leitura devem tratar NULL como "desconhecido",
-- não como "não é venda".
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS is_sales_call boolean;

COMMENT ON COLUMN public.calls.is_sales_call IS
  'Gate classification: true = transcript is a sales call, full analysis stored. false = not a sales call — transcript saved but no scores/strengths/improvements/detectedOutcome. NULL = legacy call analyzed before this gate existed (unknown, not the same as false).';
