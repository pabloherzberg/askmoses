-- ============================================================
-- 123_script_suggestion_runs_source.sql
--
-- Coluna script_suggestion_runs.source — quem disparou a rodada:
--   'cron'        → o cron semanal (app/api/cron/weekly-script-suggestion).
--                   O cron NÃO passa a coluna: fica com o DEFAULT.
--   'manual_test' → teste manual pelo scripts/preview-weekly-suggestion.mts
--                   --send-to <orgId>, só para org is_demo.
--
-- Sem ela, uma rodada de teste gravada na mesma tabela seria indistinguível
-- de uma rodada real do cron.
--
-- Depende da 121 (tabela script_suggestion_runs).
-- Idempotente: ADD COLUMN IF NOT EXISTS; o CHECK é criado só se não existir.
-- ============================================================

BEGIN;

ALTER TABLE public.script_suggestion_runs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'cron';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'script_suggestion_runs_source_check'
       AND conrelid = 'public.script_suggestion_runs'::regclass
  ) THEN
    ALTER TABLE public.script_suggestion_runs
      ADD CONSTRAINT script_suggestion_runs_source_check
      CHECK (source IN ('cron', 'manual_test'));
  END IF;
END $$;

COMMENT ON COLUMN public.script_suggestion_runs.source IS
  'Quem disparou a rodada: cron (padrão) ou manual_test '
  '(scripts/preview-weekly-suggestion.mts --send-to, só org is_demo).';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.script_suggestion_runs DROP CONSTRAINT IF EXISTS script_suggestion_runs_source_check;
-- ALTER TABLE public.script_suggestion_runs DROP COLUMN IF EXISTS source;
