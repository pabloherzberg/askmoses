-- ============================================================
-- 097_llm_provider_settings.sql
--
-- Tabela de configuração GLOBAL do provider de LLM ativo (OpenAI ou Gemini)
-- usado pelo pipeline real de análise de calls (/api/analyze). Editável pela
-- tela /admin/llm-config (seção "Provedor de LLM").
--
-- Uma linha por provider ('openai', 'gemini') — nunca deletamos, só
-- atualizamos. Trocar o provider ativo = marcar is_active=true na linha
-- escolhida e is_active=false na outra. Um índice único parcial garante que
-- no máximo uma linha esteja ativa por vez.
--
-- api_key é guardada em TEXTO SIMPLES. Não existe hoje nenhuma infra de
-- criptografia/KMS neste projeto — é uma limitação conhecida e documentada,
-- não um descuido. Mesmo nível de proteção que llm_pricing: RLS habilitado
-- SEM nenhuma policy, ou seja, só o service-role (admin client, que faz
-- bypass de RLS) consegue ler/escrever. Nunca expor api_key para o cliente —
-- a rota admin (/api/admin/llm-settings) deve sempre mascarar antes de
-- devolver no GET.
--
-- lib/llm-provider.ts é quem lê esta tabela (com cache de 5min) pra resolver
-- qual provider+modelo+key usar em /api/analyze. Sem nenhuma linha
-- is_active=true, o pipeline cai no comportamento hardcoded anterior
-- (OPENAI_API_KEY do .env) — nunca quebra por falta de configuração.
--
-- Idempotente. Rode após 096.
-- ============================================================

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

-- Provider válido.
ALTER TABLE public.llm_provider_settings
  DROP CONSTRAINT IF EXISTS llm_provider_settings_provider_check;
ALTER TABLE public.llm_provider_settings
  ADD CONSTRAINT llm_provider_settings_provider_check
  CHECK (provider IN ('openai', 'gemini'));

-- Uma linha por provider.
ALTER TABLE public.llm_provider_settings
  DROP CONSTRAINT IF EXISTS llm_provider_settings_provider_key;
ALTER TABLE public.llm_provider_settings
  ADD CONSTRAINT llm_provider_settings_provider_key
  UNIQUE (provider);

-- No máximo uma linha ativa por vez.
DROP INDEX IF EXISTS llm_provider_settings_single_active_idx;
CREATE UNIQUE INDEX llm_provider_settings_single_active_idx
  ON public.llm_provider_settings ((is_active))
  WHERE is_active;

ALTER TABLE public.llm_provider_settings ENABLE ROW LEVEL SECURITY;
-- Sem policy: mesmo padrão de llm_pricing — só service-role (bypassa RLS).
-- Guarda uma chave de API; não deve ter NENHUMA policy de leitura anon/auth.

-- ─── Seed ──────────────────────────────────────────────────────────────────
-- Nenhuma linha ativa inicialmente — força o pipeline a continuar usando o
-- fallback hardcoded (OPENAI_API_KEY do .env) até o admin configurar pela
-- tela. api_key NULL até o admin preencher.
INSERT INTO public.llm_provider_settings (provider, api_key, model, is_active, updated_by)
VALUES
  ('openai', NULL, 'gpt-4o',                false, 'system'),
  ('gemini', NULL, 'gemini-2.5-flash-lite',  false, 'system')
ON CONFLICT (provider) DO NOTHING;

COMMENT ON TABLE public.llm_provider_settings IS
  'Configuração global do provider de LLM ativo (openai|gemini) usado por '
  '/api/analyze. api_key em texto simples (sem KMS). RLS sem policy — só '
  'service-role. lib/llm-provider.ts lê com cache de 5min; sem linha ativa, '
  'cai no fallback hardcoded (env var) — nunca quebra o pipeline.';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.llm_provider_settings;
