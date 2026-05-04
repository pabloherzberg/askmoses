-- Migration: 023_call_cost_tracking
-- Purpose: Track LLM cost and prompt metadata per call.
--          Required by Task 1.2 (LLM Prompt Redesign) — toda call precisa
--          documentar o modelo usado, uso de tokens, custo em USD e versão
--          do prompt para que o ADMIN consiga atribuir gasto por org/call.
--          Decisão Lucas (2026-05-04): demo roda OpenAI-only, sem fallback
--          de provider (a comparação com Gemini foi descartada nesta fase).
--
-- Idempotente — pode rodar múltiplas vezes.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS model_used      TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens    INT,
  ADD COLUMN IF NOT EXISTS output_tokens   INT,
  ADD COLUMN IF NOT EXISTS cost_usd        NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS prompt_version  TEXT;

-- Sentinel for legacy rows so analytics queries can distinguish "v1 prompt
-- without cost tracking" from "v2 with NULL because the call failed mid-flight".
UPDATE public.calls
   SET prompt_version = 'v1'
 WHERE prompt_version IS NULL;

-- Rollback (manual):
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS model_used,
--   DROP COLUMN IF EXISTS input_tokens,
--   DROP COLUMN IF EXISTS output_tokens,
--   DROP COLUMN IF EXISTS cost_usd,
--   DROP COLUMN IF EXISTS prompt_version;
