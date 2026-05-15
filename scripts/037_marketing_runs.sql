-- ============================================================
-- 037_marketing_runs.sql
--
-- Cria a tabela que armazena cada execução do módulo Marketing
-- Intelligence — uma rodada gera headlines + primary texts a partir
-- de 3–5 calls fechadas, e o resultado é persistido para evitar
-- chamar o LLM em toda pageview.
--
-- Fluxo:
--   - GET /api/marketing-intelligence — devolve a última run; se >7d
--     ou inexistente, dispara nova run automática (trigger='auto').
--   - POST /api/marketing-intelligence/run — admin força nova run
--     manual (trigger='manual').
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.marketing_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_call_ids UUID[] NOT NULL,
  headlines       JSONB NOT NULL,
  primary_texts   JSONB NOT NULL,
  model_used      TEXT,
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10,6),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger         TEXT NOT NULL DEFAULT 'manual'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_runs_trigger_check'
  ) THEN
    ALTER TABLE public.marketing_runs
      ADD CONSTRAINT marketing_runs_trigger_check
      CHECK (trigger IN ('auto', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS marketing_runs_org_ran_idx
  ON public.marketing_runs(org_id, ran_at DESC);

ALTER TABLE public.marketing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_runs_select_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_select_by_org" ON public.marketing_runs
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org());

COMMENT ON TABLE public.marketing_runs IS
  'Cada linha = 1 execução do módulo Marketing Intelligence. '
  'Armazena o sample de calls fechadas usadas, o copy gerado e o custo do LLM. '
  'GET /api/marketing-intelligence consulta a última run da org.';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.marketing_runs;
