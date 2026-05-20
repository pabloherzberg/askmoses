-- ============================================================
-- 045_organizations_ghl_credentials.sql
--
-- Adiciona credenciais per-org da integração GHL/Pepper.
-- Cada cliente (org) tem seu próprio Pepper configurado, com
-- locationId, Private Integration Token (PIT) e um webhook secret
-- que geramos do nosso lado.
--
-- Por que aqui e não na migration 044:
--   044 adicionou `ghl_location_id` pensando em single-tenant. Agora
--   precisamos das credenciais (token + secret) e do flag de
--   enabled. Mantém 044 estável e adiciona o que faltou em 045.
--
-- Segurança:
--   - Tokens e secret armazenados em plain text. RLS de
--     `organizations` já restringe leitura à própria org (policy
--     `orgs_select_own`). API admin lê via service_role e nunca
--     retorna plaintext em GET — apenas versão mascarada.
--   - Considerar pgsodium/Vault quando virar requisito de compliance.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_access_token        TEXT,
  ADD COLUMN IF NOT EXISTS ghl_webhook_secret      TEXT,
  ADD COLUMN IF NOT EXISTS ghl_integration_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ghl_configured_at       TIMESTAMPTZ;

-- Índice parcial: o webhook lookup precisa só de orgs habilitadas e
-- com locationId conhecido. Cobre o caminho quente (POST do Pepper).
CREATE INDEX IF NOT EXISTS organizations_ghl_enabled_idx
  ON public.organizations(ghl_location_id)
  WHERE ghl_integration_enabled = true
    AND ghl_location_id IS NOT NULL;

-- Rollback (manual):
-- DROP INDEX IF EXISTS public.organizations_ghl_enabled_idx;
-- ALTER TABLE public.organizations
--   DROP COLUMN IF EXISTS ghl_access_token,
--   DROP COLUMN IF EXISTS ghl_webhook_secret,
--   DROP COLUMN IF EXISTS ghl_integration_enabled,
--   DROP COLUMN IF EXISTS ghl_configured_at;
