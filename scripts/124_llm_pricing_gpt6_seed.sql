-- ============================================================
-- 124_llm_pricing_gpt6_seed.sql
--
-- Preço de gpt-6.1-sol e gpt-6-astra em llm_pricing (088), para
-- lib/services/llm-usage.ts calcular cost_usd. Sem linha aqui o custo é
-- gravado como 0 (getPricing/computeCostForModel).
--
-- Fonte: developers.openai.com/api/docs/pricing e as páginas de modelo
-- (/api/docs/models/gpt-6.1-sol, /gpt-6-astra), conferidas em 30/09/2026.
-- Standard, "short context" (≤ 272k tokens de entrada), USD por 1M tokens:
--   gpt-6.1-sol  input 2.00   output 10.00  (cached 0.10, cache write 2.50)
--   gpt-6-astra  input 10.00  output 50.00  (cached 1.00, cache write 12.50)
-- llm_pricing só guarda input/output: o desconto de cache não é aplicado
-- (o custo calculado fica, no máximo, acima do real). Long context (> 272k)
-- custa 2x input e 1,5x output — nenhum prompt nosso chega lá.
--
-- Só cadastra preço: nenhum módulo passa a usar estes modelos.
-- Idempotente: insere só se não houver linha ativa do (provider, model).
-- ============================================================

BEGIN;

INSERT INTO public.llm_pricing
  (provider, model, unit, input_usd_per_1m, output_usd_per_1m, usd_per_minute, effective_from)
SELECT v.provider, v.model, 'per_1m_tokens', v.input, v.output, NULL, now()
FROM (VALUES
  ('openai', 'gpt-6.1-sol', 2.00::numeric,  10.00::numeric),
  ('openai', 'gpt-6-astra', 10.00::numeric, 50.00::numeric)
) AS v(provider, model, input, output)
WHERE NOT EXISTS (
  SELECT 1 FROM public.llm_pricing p
   WHERE p.provider = v.provider AND p.model = v.model AND p.active
);

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- DELETE FROM public.llm_pricing
--  WHERE provider = 'openai' AND model IN ('gpt-6.1-sol', 'gpt-6-astra');
