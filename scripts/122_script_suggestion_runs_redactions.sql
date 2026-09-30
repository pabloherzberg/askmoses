-- ============================================================
-- 122_script_suggestion_runs_redactions.sql
--
-- Coluna script_suggestion_runs.redactions — o que a anonimização do script
-- semanal substituiu antes de gravar (lib/script-intelligence/
-- weekly-anonymization.ts).
--
-- Formato: [{ "kind": "money"|"org"|"trainer"|"lead",
--             "field": "sections[Offer Presentation].instructions",
--             "count": 2 }]
-- De propósito SEM o termo original: registrar o nome ou o valor que foi
-- removido seria guardar exatamente o dado que a substituição tirou do script.
--
-- Depende da 121 (tabela script_suggestion_runs).
-- Idempotente: ADD COLUMN IF NOT EXISTS; COMMENT pode repetir.
-- ============================================================

BEGIN;

ALTER TABLE public.script_suggestion_runs
  ADD COLUMN IF NOT EXISTS redactions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.script_suggestion_runs.redactions IS
  'Substituições de anonimização feitas antes de gravar o script: '
  '[{kind: money|org|trainer|lead, field, count}]. Nunca guarda o termo original.';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.script_suggestion_runs DROP COLUMN IF EXISTS redactions;
