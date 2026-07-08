-- ============================================================
-- 101_ai_module_configs.sql
--
-- Config GLOBAL de tuning (temperature + max_tokens) por MÓDULO de IA, editável
-- pela tela /admin/llm-config (seção "Módulos IA"). Substitui os arrays em
-- memória de lib/mock-data.ts (aiModuleConfigs / aiModuleConfigLog), que
-- resetavam a cada cold start e não eram compartilhados entre instâncias
-- serverless.
--
-- Dois eixos independentes na feature de LLM Config (NÃO confundir):
--   - PROVIDER + CHAVE  → llm_provider_settings (099). Decide QUAL LLM roda.
--   - TUNING por módulo → ESTA tabela. Decide temperature/max_tokens de cada
--     grupo de serviços. Ver lib/constants/ai-modules.ts p/ o mapa
--     módulo → serviços (ex.: scoring_engine cobre /api/analyze + scoring +
--     intent-scoring).
--
-- Config é GLOBAL (não por org). Uma linha por module_id. Nunca deletamos —
-- só atualizamos os valores e registramos um evento em ai_module_config_log.
--
-- RLS habilitado SEM policy: mesmo padrão de llm_provider_settings/llm_pricing.
-- Só o service-role (admin client, que bypassa RLS) lê/escreve. A rota
-- /api/ai-module-configs (admin-gated) é a única porta de escrita.
--
-- lib/db/ai-module-configs.ts lê esta tabela (cache de 5min) pra resolver o
-- tuning de cada módulo antes de cada execução. Sem linha pro módulo, os
-- engines caem no default hardcoded (temperature das constantes atuais) —
-- nunca quebra o pipeline por falta de configuração.
--
-- Idempotente. Rode após 100.
-- ============================================================

-- ─── Config atual por módulo ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_module_configs (
  module_id    TEXT PRIMARY KEY,
  temperature  NUMERIC(3,2) NOT NULL,
  max_tokens   INTEGER NOT NULL,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulo válido (espelha AiModuleId em lib/types.ts).
ALTER TABLE public.ai_module_configs
  DROP CONSTRAINT IF EXISTS ai_module_configs_module_check;
ALTER TABLE public.ai_module_configs
  ADD CONSTRAINT ai_module_configs_module_check
  CHECK (module_id IN ('scoring_engine', 'correlation_engine', 'marketing_intelligence'));

-- Ranges válidos (espelham a validação server-side da rota + a UI).
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

-- ─── Log de alterações (append-only) ─────────────────────────────────────────
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

-- Leitura do log: mais recentes primeiro por módulo.
CREATE INDEX IF NOT EXISTS ai_module_config_log_recent_idx
  ON public.ai_module_config_log(updated_at DESC);

ALTER TABLE public.ai_module_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_module_config_log ENABLE ROW LEVEL SECURITY;
-- Sem policy: config global, só service-role (admin client) lê/escreve.

-- ─── Seed ──────────────────────────────────────────────────────────────────
-- Temperaturas espelham lib/mock-data.ts. max_tokens em 2000 (não os 1000 do
-- mock antigo): agora que o valor é APLICADO de verdade como maxOutputTokens,
-- 1000 truncaria o JSON de análise em rubricas com muitas seções (→ falha).
-- 2000 é um default seguro; o admin pode subir até 4000 pela tela.
-- ON CONFLICT DO NOTHING mantém idempotência sem sobrescrever ajustes do admin.
INSERT INTO public.ai_module_configs (module_id, temperature, max_tokens, updated_by)
VALUES
  ('scoring_engine',         0.2, 2000, 'system'),
  ('correlation_engine',     0.5, 2000, 'system'),
  ('marketing_intelligence', 0.8, 2000, 'system')
ON CONFLICT (module_id) DO NOTHING;

COMMENT ON TABLE public.ai_module_configs IS
  'Tuning global (temperature/max_tokens) por módulo de IA, editável em '
  '/admin/llm-config. Uma linha por module_id. RLS sem policy — só '
  'service-role. lib/db/ai-module-configs.ts lê com cache de 5min; sem linha, '
  'engines caem no default hardcoded. Ver lib/constants/ai-modules.ts p/ o mapa '
  'módulo → serviços.';

COMMENT ON TABLE public.ai_module_config_log IS
  'Log append-only de alterações de tuning por módulo (módulo, campo, valor '
  'anterior/novo, usuário, timestamp). Alimentado por /api/ai-module-configs.';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.ai_module_config_log;
-- DROP TABLE IF EXISTS public.ai_module_configs;
