-- Migration: 026_prompt_version_check
-- Purpose: Constrain `calls.prompt_version` to known values so the column
--          doesn't drift into wildcards (`v2-fixed`, `V2`, `prompt-v2`, …)
--          that break analytics and A/B reads. Whitelist is intentionally
--          tight — adding a new prompt version is a deliberate migration.
--
-- Idempotente — pode rodar múltiplas vezes.

DO $$
BEGIN
  -- O lookup precisa qualificar schema + tabela. conname não é único globalmente
  -- no Postgres — uma `calls_prompt_version_check` em outro schema faria o
  -- IF pular o ALTER e public.calls.prompt_version ficaria sem CHECK.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
     WHERE c.conname = 'calls_prompt_version_check'
       AND t.relname = 'calls'
       AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_prompt_version_check
      CHECK (prompt_version IS NULL OR prompt_version IN ('v1', 'v2'));
  END IF;
END $$;

-- Rollback (manual):
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_prompt_version_check;
