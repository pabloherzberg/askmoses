-- ============================================================
-- 126_rollback.sql
--
-- Desfaz scripts/126_org_coaching_copy_emails.sql.
--
-- ATENÇÃO: apaga as listas de cópia configuradas pelas orgs. Se houver dados,
-- guarde antes:
--   SELECT id, name, coaching_copy_emails FROM public.organizations
--   WHERE cardinality(coaching_copy_emails) > 0;
--
-- O código tolera a coluna ausente (sendGhlCoachingEmail segue sem cópias),
-- mas a tela de Members passa a mostrar erro ao carregar/salvar a lista.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_coaching_copy_emails_max5;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS coaching_copy_emails;

COMMIT;
