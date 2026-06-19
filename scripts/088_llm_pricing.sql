-- ============================================================
-- 088_llm_pricing.sql
--
-- Tabela VERSIONADA de preços de LLM. Fonte de verdade dos custos por
-- modelo, usada pelo recorder lib/services/llm-usage.ts para calcular o
-- cost_usd de cada chamada de LLM (que vai pra llm_usage_events, ver 089).
--
-- Por que versionada (effective_from + active) e não constante no código:
--   - Preços de LLM mudam. Como cada evento em llm_usage_events grava o
--     cost_usd NO MOMENTO da chamada, editar preço aqui depois NÃO reescreve
--     custo histórico — só afeta eventos futuros. Mudar preço = inserir uma
--     linha nova (effective_from mais recente, active=true) e desativar a
--     antiga (active=false). Sem deploy de código.
--
-- Unidades:
--   - per_1m_tokens (default): usa input_usd_per_1m + output_usd_per_1m.
--   - per_minute (whisper): usa usd_per_minute (tokens não se aplicam).
--
-- Seed espelha lib/constants/llm.ts (PRICING_USD_PER_1M) — OpenAI-only.
-- NÃO há linhas de Gemini: o projeto migrou tudo para OpenAI.
--
-- RLS: pricing é GLOBAL (não tem org). Sem policy de leitura por org — só o
-- service-role (admin client) lê/escreve. O recorder roda server-side com
-- admin client.
--
-- Idempotente. Rode após 087.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.llm_pricing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL DEFAULT 'openai',
  model             TEXT NOT NULL,
  unit              TEXT NOT NULL DEFAULT 'per_1m_tokens',
  input_usd_per_1m  NUMERIC(12,6),
  output_usd_per_1m NUMERIC(12,6),
  usd_per_minute    NUMERIC(12,6),
  effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unidade válida.
ALTER TABLE public.llm_pricing
  DROP CONSTRAINT IF EXISTS llm_pricing_unit_check;
ALTER TABLE public.llm_pricing
  ADD CONSTRAINT llm_pricing_unit_check
  CHECK (unit IN ('per_1m_tokens', 'per_minute'));

-- Uma linha por (provider, model, effective_from) → seed idempotente.
ALTER TABLE public.llm_pricing
  DROP CONSTRAINT IF EXISTS llm_pricing_provider_model_from_key;
ALTER TABLE public.llm_pricing
  ADD CONSTRAINT llm_pricing_provider_model_from_key
  UNIQUE (provider, model, effective_from);

-- Lookup do recorder: preço ativo mais recente por (provider, model).
CREATE INDEX IF NOT EXISTS llm_pricing_lookup_idx
  ON public.llm_pricing(provider, model, effective_from DESC)
  WHERE active;

ALTER TABLE public.llm_pricing ENABLE ROW LEVEL SECURITY;
-- Sem policy: pricing é global e só acessada via service-role (admin client),
-- que bypassa RLS. Habilitar RLS sem policy = nega qualquer acesso anon/auth.

-- ─── Seed (OpenAI, preços públicos de 2026-01, = PRICING_USD_PER_1M) ─────────
INSERT INTO public.llm_pricing
  (provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from)
VALUES
  ('openai', 'gpt-4o',        'per_1m_tokens', 2.5,  10,   NULL,  '2026-01-01T00:00:00Z'),
  ('openai', 'gpt-4o-mini',   'per_1m_tokens', 0.15, 0.6,  NULL,  '2026-01-01T00:00:00Z'),
  ('openai', 'gpt-4-turbo',   'per_1m_tokens', 10,   30,   NULL,  '2026-01-01T00:00:00Z'),
  ('openai', 'gpt-4',         'per_1m_tokens', 30,   60,   NULL,  '2026-01-01T00:00:00Z'),
  ('openai', 'gpt-3.5-turbo', 'per_1m_tokens', 0.5,  1.5,  NULL,  '2026-01-01T00:00:00Z'),
  ('openai', 'whisper-1',     'per_minute',    NULL, NULL, 0.006, '2026-01-01T00:00:00Z')
ON CONFLICT (provider, model, effective_from) DO NOTHING;

COMMENT ON TABLE public.llm_pricing IS
  'Preços de LLM versionados (effective_from + active). Fonte de verdade do '
  'custo por modelo p/ lib/services/llm-usage.ts. Mudar preço = inserir linha '
  'nova active e desativar a antiga; custo histórico em llm_usage_events não muda.';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.llm_pricing;
