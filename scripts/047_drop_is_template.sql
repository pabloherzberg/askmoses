-- ============================================================
-- 047_drop_is_template.sql
--
-- Remove a coluna scripts.is_template (introduzida em 044) — virou
-- dead-weight depois que o catalog endpoint passou a aceitar TODOS
-- os scripts (template ou não). A view org_scripts_current já não
-- referencia is_template após a 046.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.scripts
  DROP COLUMN IF EXISTS is_template;
