-- ============================================================
-- 075_script_gap_runs.sql
--
-- Registra cada execução do Script Gap Detection. Serve como marcador
-- de "última análise" independente de haver gaps — uma run que não
-- encontra atrito (0 gaps) ainda grava ran_at, evitando que toda
-- visita ao dashboard re-dispare a IA.
--
-- Fluxo (stale-while-serving, igual ao Marketing Intelligence):
--   getScriptGaps() lê a última run; se >7d ou inexistente, dispara
--   uma nova análise automática (trigger='auto') e persiste os gaps.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.script_gap_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  call_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- calls analisadas nessa run
  gap_count       INT NOT NULL DEFAULT 0,
  model_used      TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger         TEXT NOT NULL DEFAULT 'auto'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'script_gap_runs_trigger_check'
  ) THEN
    ALTER TABLE public.script_gap_runs
      ADD CONSTRAINT script_gap_runs_trigger_check
      CHECK (trigger IN ('auto', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS script_gap_runs_org_ran_idx
  ON public.script_gap_runs(org_id, ran_at DESC);

ALTER TABLE public.script_gap_runs ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (API routes / server usam admin client)
DROP POLICY IF EXISTS "script_gap_runs_service_role" ON public.script_gap_runs;
CREATE POLICY "script_gap_runs_service_role" ON public.script_gap_runs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Owner pode ler as runs da própria org via JWT
DROP POLICY IF EXISTS "script_gap_runs_select_org" ON public.script_gap_runs;
CREATE POLICY "script_gap_runs_select_org" ON public.script_gap_runs
  FOR SELECT
  USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

COMMENT ON TABLE public.script_gap_runs IS
  'Cada linha = 1 execução do Script Gap Detection. Marca ran_at para '
  'o trigger stale-while-serving (>7d re-dispara a análise).';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.script_gap_runs;
