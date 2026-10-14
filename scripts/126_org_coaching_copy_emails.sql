-- ============================================================
-- 126_org_coaching_copy_emails.sql
--
-- Lista de cópias do email de coaching, por organização.
--
-- POR QUE: o owner quer receber (ou mandar para um gerente) uma cópia de todo
-- email de coaching enviado aos vendedores da org. Os endereços não precisam
-- ter login no AskMoses nem ser usuário do GHL.
--
-- USO: sendGhlCoachingEmail (lib/services/ghl-coaching-email.ts) lê a lista da
-- org da call e envia em BCC no mesmo resend.emails.send. O email do próprio
-- vendedor sai da lista; com DEV_EMAIL_OVERRIDE ativo, nenhuma cópia é enviada.
-- A API (app/api/organizations/coaching-copy-emails) valida formato, lowercase,
-- sem duplicados e no máximo 5. O CHECK abaixo garante o limite no banco.
--
-- Idempotente. Sem backfill: default '{}' = nenhuma cópia (comportamento atual).
-- Rollback: scripts/126_rollback.sql (e o bloco comentado no fim).
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS coaching_copy_emails text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_coaching_copy_emails_max5'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_coaching_copy_emails_max5
      CHECK (cardinality(coaching_copy_emails) <= 5);
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.coaching_copy_emails IS
  'Endereços (lowercase, máx. 5) que recebem em BCC uma cópia de todo email de coaching da org. Migration 126.';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_coaching_copy_emails_max5;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS coaching_copy_emails;
