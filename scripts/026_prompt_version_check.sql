-- Migration: 026_prompt_version_check
-- Purpose: Constrain `calls.prompt_version` to known values so the column
--          doesn't drift into wildcards (`v2-fixed`, `V2`, `prompt-v2`, …)
--          that break analytics and A/B reads. Whitelist is intentionally
--          tight — adding a new prompt version is a deliberate migration.
--
-- Idempotente — pode rodar múltiplas vezes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calls_prompt_version_check'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_prompt_version_check
      CHECK (prompt_version IS NULL OR prompt_version IN ('v1', 'v2'));
  END IF;
END $$;

-- Rollback (manual):
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_prompt_version_check;
