-- ============================================================
-- 034_invite_tokens.sql
--
-- Tokens de convite próprios, por (user_id, org_id) — um token por
-- membership. Hoje (até 033) o link de convite usa o token do auth
-- do Supabase, que é por user (email): em multi-org, reenviar invite
-- pra org B invalida o link que ainda estava válido pra org A do
-- mesmo email. Esta tabela move a fonte de verdade do token pra
-- application-side, isolando o ciclo de vida por membership:
--
--   - Reenvio em (user, org_B) só invalida o token de (user, org_B);
--     o token de (user, org_A) segue ativo até clicar/expirar/revogar.
--   - Auditável: cada (re)envio gera uma linha; histórico fica.
--   - Revoke da membership cascateia (FK).
--
-- O cleartext do token nunca é persistido — só vai no email. Aqui
-- guardamos apenas SHA-256 (`token_hash`). Lookup no callback é por
-- hash do que o cliente apresentou.
--
-- Lockdown total: RLS habilitado, sem policies pra anon/authenticated.
-- O fluxo de invite/callback roda via service_role (createAdminClient
-- em /lib/supabase/admin.ts).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DO $$ … END $$ pra grants.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  org_id          UUID NOT NULL,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  invalidated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  -- FK composta pra memberships: revogar a membership (DELETE) limpa
  -- automaticamente os tokens dela. Sem isso, sobraria token órfão
  -- apontando pra (user, org) que não existe mais.
  FOREIGN KEY (user_id, org_id)
    REFERENCES public.memberships(user_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON DELETE SET NULL,
  -- Defesa em profundidade: rejeita estados impossíveis (consumido E invalidado).
  CONSTRAINT invite_tokens_lifecycle_chk CHECK (
    NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
  )
);

-- ─── 2. Índices ──────────────────────────────────────────────────────────────

-- Lookup principal: callback recebe o token, busca por hash.
-- UNIQUE pra evitar colisão de hash (probabilidade desprezível em SHA-256,
-- mas o constraint protege contra bug de geração que reuse seed).
CREATE UNIQUE INDEX IF NOT EXISTS invite_tokens_token_hash_uidx
  ON public.invite_tokens(token_hash);

-- Garante que existe no máximo 1 token "vivo" (não consumido, não invalidado)
-- por (user, org). Reenviar invalida o anterior antes de inserir o novo —
-- esta partial unique fecha race se 2 reenvios concorrerem pra mesma membership.
CREATE UNIQUE INDEX IF NOT EXISTS invite_tokens_active_per_membership_uidx
  ON public.invite_tokens(user_id, org_id)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Filtros operacionais comuns:
--   - listar tokens por user (todos os convites pendentes daquele user)
--   - cleanup job: SELECT … WHERE expires_at < now() AND consumed_at IS NULL
CREATE INDEX IF NOT EXISTS invite_tokens_user_id_idx
  ON public.invite_tokens(user_id);

CREATE INDEX IF NOT EXISTS invite_tokens_expires_at_idx
  ON public.invite_tokens(expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- ─── 3. RLS — lockdown total ─────────────────────────────────────────────────
-- Token hashes não devem ser legíveis pelo cliente em hipótese nenhuma.
-- Habilitamos RLS sem policies pra anon/authenticated; só service_role
-- (BYPASSRLS) acessa via createAdminClient. Mesmo padrão das funções
-- protegidas em 032.

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- FORCE garante que até o owner da tabela respeita RLS — defesa contra
-- mudanças futuras de role (ex.: alguém setando authenticated como owner).
ALTER TABLE public.invite_tokens FORCE ROW LEVEL SECURITY;

-- Revoga grants implícitos. Por padrão, CREATE TABLE em public dá SELECT
-- pra PUBLIC dependendo da config — fechamos explicitamente.
REVOKE ALL ON public.invite_tokens FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.invite_tokens TO   service_role;

-- ─── 4. Helper: invalida tokens ativos de uma membership ────────────────────
-- Usado pelo POST /api/invites/[id]/resend ANTES de inserir o token novo.
-- Atomic + idempotente: marca invalidated_at em todos os ativos da membership.
-- Retorna a contagem invalidada (pra log/telemetria, opcional).
--
-- SECURITY DEFINER pra rodar com privilégios da função (que é dona
-- service_role), permitindo que o caller (mesmo via admin client) não
-- precise se preocupar com RLS context.

CREATE OR REPLACE FUNCTION public.invalidate_active_invite_tokens(
  p_user_id UUID,
  p_org_id  UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.invite_tokens
     SET invalidated_at = now()
   WHERE user_id = p_user_id
     AND org_id  = p_org_id
     AND consumed_at    IS NULL
     AND invalidated_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_active_invite_tokens(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.invalidate_active_invite_tokens(uuid, uuid)
  TO   service_role;

-- ─── 5. Helper: consome um token e devolve a membership ─────────────────────
-- Atomic: na mesma query marca consumed_at e devolve (user_id, org_id) se
-- o token estava válido (não expirado, não consumido, não invalidado).
-- Se já estava consumido/expirado/invalidado, devolve linha vazia.
--
-- Usado pelo callback /api/auth/verify-invite-token. Garante que o token
-- é one-shot: dois clicks concorrentes — só um ganha.

CREATE OR REPLACE FUNCTION public.consume_invite_token(
  p_token_hash TEXT
)
RETURNS TABLE(user_id UUID, org_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.invite_tokens
     SET consumed_at = now()
   WHERE token_hash = p_token_hash
     AND consumed_at    IS NULL
     AND invalidated_at IS NULL
     AND expires_at     > now()
  RETURNING user_id, org_id;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_invite_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_invite_token(text)
  TO   service_role;

-- ─── 6. Comentários (documentação inline pro psql/pgAdmin) ──────────────────

COMMENT ON TABLE  public.invite_tokens IS
  'Tokens de convite per-membership. Substitui o token-por-user do Supabase Auth no fluxo de convite — permite reenvio isolado por org sem invalidar links de outras orgs do mesmo user.';

COMMENT ON COLUMN public.invite_tokens.token_hash IS
  'SHA-256 hex do token cleartext. O cleartext só circula no email; nunca é persistido.';

COMMENT ON COLUMN public.invite_tokens.consumed_at IS
  'Timestamp do clique no link válido. NULL = não usado. Set por consume_invite_token().';

COMMENT ON COLUMN public.invite_tokens.invalidated_at IS
  'Timestamp da invalidação por reenvio. NULL = ativo. Set por invalidate_active_invite_tokens() antes de gerar token novo.';
