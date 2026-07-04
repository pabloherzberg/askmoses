-- ============================================================
-- 100_llm_pricing_gemini_seed.sql
--
-- Semeia linhas de preço do Gemini na tabela llm_pricing (088). Sem mudança
-- de schema — llm_pricing já suporta qualquer valor de `provider`, só
-- faltavam linhas 'gemini'. Necessário para lib/services/llm-usage.ts
-- calcular cost_usd corretamente quando o provider ativo (099) é Gemini —
-- sem uma linha de pricing correspondente, o custo é gravado como 0
-- (ver getPricing() em lib/services/llm-usage.ts).
--
-- Modelos espelham a whitelist VALID_MODELS de lib/gemini.ts. As variantes
-- pinadas "-001" (gemini-2.0-flash-001, gemini-2.0-flash-lite-001) NÃO têm
-- linha própria — lib/llm-provider.ts normaliza o sufixo "-001" para o nome
-- base antes de buscar o preço, evitando duplicar linha por variante pinada.
--
-- ⚠️  ATENÇÃO: os valores abaixo são preços de REFERÊNCIA/placeholder, não
-- conferidos contra o rate card público atual do Google (ai.google.dev/pricing).
-- O admin deve validar e ajustar pela tela /admin/llm-config antes de confiar
-- no COGS calculado a partir destes valores.
--
-- Idempotente. Rode após 099.
-- ============================================================

INSERT INTO public.llm_pricing
  (provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from)
VALUES
  ('gemini', 'gemini-2.5-pro',        'per_1m_tokens', 1.25,  10.0, NULL, now()),
  ('gemini', 'gemini-2.5-flash',      'per_1m_tokens', 0.30,  2.50, NULL, now()),
  ('gemini', 'gemini-2.5-flash-lite', 'per_1m_tokens', 0.10,  0.40, NULL, now()),
  ('gemini', 'gemini-2.0-flash',      'per_1m_tokens', 0.10,  0.40, NULL, now()),
  ('gemini', 'gemini-2.0-flash-lite', 'per_1m_tokens', 0.075, 0.30, NULL, now())
ON CONFLICT (provider, model, effective_from) DO NOTHING;

COMMENT ON TABLE public.llm_pricing IS
  'Preços de LLM versionados (effective_from + active). Fonte de verdade do '
  'custo por modelo p/ lib/services/llm-usage.ts. Mudar preço = inserir linha '
  'nova active e desativar a antiga; custo histórico em llm_usage_events não muda. '
  'Inclui OpenAI (seed 089) e Gemini (seed 100, valores de referência a validar).';

-- Rollback (manual):
-- DELETE FROM public.llm_pricing WHERE provider = 'gemini';
