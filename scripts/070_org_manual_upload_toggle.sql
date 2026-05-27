-- ============================================================
-- 070_org_manual_upload_toggle.sql
--
-- Adiciona feature flag por org pra controlar se Owner/Admin podem
-- usar o upload manual de calls (/dashboard/upload). Default: false
-- (GHL/Pepper é o canal padrão de ingestão).
--
-- Admin liga/desliga em /admin/organizations/[id]. Orgs existentes
-- começam com false; Admin habilita manualmente quem ainda precisar
-- do upload manual (legado, demos, troubleshooting).
--
-- Enforcement nesta fase é frontend-only (sidebar esconde + page
-- redireciona). API /api/analyze continua aberta; hardening fica
-- pra follow-up.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS manual_upload_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.manual_upload_enabled IS
  'Se true, Owner/Admin podem usar upload manual de calls em /dashboard/upload. Default false: ingestão por GHL/Pepper.';
