-- ============================================================
-- apply_llm_config.sql — APLICA TODA A FEATURE LLM CONFIG DE UMA VEZ
--
-- Convenience script: junta 099 (provider settings) + seed de pricing Gemini
-- (100, com effective_from FIXO p/ ser idempotente) + 101 (ai_module_configs).
-- A tabela llm_pricing (088) já deve existir — este script NÃO a recria.
--
-- COMO RODAR: Supabase Dashboard → SQL Editor → New query → colar TUDO →
-- Run. 100% idempotente: pode rodar quantas vezes quiser sem duplicar nada.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) llm_provider_settings (migration 099)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.llm_provider_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,
  api_key       TEXT,
  model         TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.llm_provider_settings
  DROP CONSTRAINT IF EXISTS llm_provider_settings_provider_check;
ALTER TABLE public.llm_provider_settings
  ADD CONSTRAINT llm_provider_settings_provider_check
  CHECK (provider IN ('openai', 'gemini'));

ALTER TABLE public.llm_provider_settings
  DROP CONSTRAINT IF EXISTS llm_provider_settings_provider_key;
ALTER TABLE public.llm_provider_settings
  ADD CONSTRAINT llm_provider_settings_provider_key
  UNIQUE (provider);

DROP INDEX IF EXISTS llm_provider_settings_single_active_idx;
CREATE UNIQUE INDEX llm_provider_settings_single_active_idx
  ON public.llm_provider_settings ((is_active))
  WHERE is_active;

ALTER TABLE public.llm_provider_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.llm_provider_settings (provider, api_key, model, is_active, updated_by)
VALUES
  ('openai', NULL, 'gpt-4o',                 false, 'system'),
  ('gemini', NULL, 'gemini-2.5-flash-lite',  false, 'system')
ON CONFLICT (provider) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Seed de pricing Gemini em llm_pricing (100 — effective_from FIXO p/ idempotência)
--    ⚠️ Valores de REFERÊNCIA — validar contra ai.google.dev/pricing pela tela.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.llm_pricing
  (provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from)
VALUES
  ('gemini', 'gemini-2.5-pro',        'per_1m_tokens', 1.25,  10.0, NULL, '2026-01-01T00:00:00Z'),
  ('gemini', 'gemini-2.5-flash',      'per_1m_tokens', 0.30,  2.50, NULL, '2026-01-01T00:00:00Z'),
  ('gemini', 'gemini-2.5-flash-lite', 'per_1m_tokens', 0.10,  0.40, NULL, '2026-01-01T00:00:00Z'),
  ('gemini', 'gemini-2.0-flash',      'per_1m_tokens', 0.10,  0.40, NULL, '2026-01-01T00:00:00Z'),
  ('gemini', 'gemini-2.0-flash-lite', 'per_1m_tokens', 0.075, 0.30, NULL, '2026-01-01T00:00:00Z')
ON CONFLICT (provider, model, effective_from) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ai_module_configs + ai_module_config_log (migration 101)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_module_configs (
  module_id    TEXT PRIMARY KEY,
  temperature  NUMERIC(3,2) NOT NULL,
  max_tokens   INTEGER NOT NULL,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_module_configs
  DROP CONSTRAINT IF EXISTS ai_module_configs_module_check;
ALTER TABLE public.ai_module_configs
  ADD CONSTRAINT ai_module_configs_module_check
  CHECK (module_id IN ('scoring_engine', 'correlation_engine', 'marketing_intelligence'));

ALTER TABLE public.ai_module_configs
  DROP CONSTRAINT IF EXISTS ai_module_configs_temperature_check;
ALTER TABLE public.ai_module_configs
  ADD CONSTRAINT ai_module_configs_temperature_check
  CHECK (temperature >= 0.0 AND temperature <= 1.0);

ALTER TABLE public.ai_module_configs
  DROP CONSTRAINT IF EXISTS ai_module_configs_max_tokens_check;
ALTER TABLE public.ai_module_configs
  ADD CONSTRAINT ai_module_configs_max_tokens_check
  CHECK (max_tokens >= 100 AND max_tokens <= 4000);

CREATE TABLE IF NOT EXISTS public.ai_module_config_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       TEXT NOT NULL,
  field           TEXT NOT NULL,
  previous_value  NUMERIC(12,2) NOT NULL,
  new_value       NUMERIC(12,2) NOT NULL,
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_module_config_log
  DROP CONSTRAINT IF EXISTS ai_module_config_log_field_check;
ALTER TABLE public.ai_module_config_log
  ADD CONSTRAINT ai_module_config_log_field_check
  CHECK (field IN ('temperature', 'max_tokens'));

CREATE INDEX IF NOT EXISTS ai_module_config_log_recent_idx
  ON public.ai_module_config_log(updated_at DESC);

ALTER TABLE public.ai_module_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_module_config_log ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_module_configs (module_id, temperature, max_tokens, updated_by)
VALUES
  ('scoring_engine',         0.2, 2000, 'system'),
  ('correlation_engine',     0.5, 2000, 'system'),
  ('marketing_intelligence', 0.8, 2000, 'system')
ON CONFLICT (module_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação rápida (opcional): deve retornar 2 providers, 3 módulos e ≥5 preços gemini.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT 'providers' AS t, count(*) FROM public.llm_provider_settings
-- UNION ALL SELECT 'modules', count(*) FROM public.ai_module_configs
-- UNION ALL SELECT 'gemini_pricing', count(*) FROM public.llm_pricing WHERE provider='gemini';
