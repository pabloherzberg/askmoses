-- ============================================================
-- 027_memberships_and_active_org.sql
-- Multi-org foundation:
--   - public.memberships (user_id × org_id × role × invite_status)
--   - users.active_org_id (org "selecionada" agora pelo user)
--   - current_org() — função SQL que lê active_org_id; vai
--     substituir auth.jwt()->>'org_id' nas RLS policies (na 028)
--
-- Admin global NÃO entra em memberships — admin é orthogonal a
-- org. JWT app_metadata.role='admin' continua sendo o sinal.
--
-- Idempotente: INSERT ... ON CONFLICT, UPDATE ... WHERE IS NULL,
-- IF NOT EXISTS, OR REPLACE. Pode re-rodar sem efeito colateral.
-- ============================================================

-- ─── 1. Tabela memberships ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.memberships (
  user_id        UUID NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'trainer')),
  invite_status  TEXT NOT NULL DEFAULT 'accepted'
                   CHECK (invite_status IN ('pending', 'accepted')),
  invited_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx       ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_org_id_idx        ON public.memberships(org_id);
CREATE INDEX IF NOT EXISTS memberships_invite_status_idx ON public.memberships(invite_status);

-- ─── 2. users.active_org_id ──────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_org_id UUID
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_org_id_idx ON public.users(active_org_id);

-- ─── 3. current_org() ────────────────────────────────────────────────────────
-- Lê users.active_org_id para o auth.uid() corrente.
-- SECURITY DEFINER: contorna RLS de users (a função é chamada por policies de
-- outras tabelas — precisa funcionar sem depender da policy de users).
-- STABLE: depende do estado da tabela mas é determinística dentro da query.

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT active_org_id FROM public.users WHERE id = auth.uid()
$$;

-- ─── 4. Backfill memberships a partir de users ───────────────────────────────
-- Cada user com role IN ('owner','trainer') e org_id definido vira uma
-- membership equivalente. Admin é ignorado (não pertence a org).

INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_by, invited_at)
SELECT
  u.id,
  u.org_id,
  u.role,
  COALESCE(u.invite_status, 'accepted'),
  u.invited_by,
  u.invited_at
FROM public.users u
WHERE u.role IN ('owner', 'trainer')
  AND u.org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ─── 5. Backfill users.active_org_id ─────────────────────────────────────────

UPDATE public.users
SET    active_org_id = org_id
WHERE  active_org_id IS NULL
  AND  org_id IS NOT NULL;

-- ─── 6. RLS em memberships ───────────────────────────────────────────────────

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_service_role_all" ON public.memberships;
CREATE POLICY "memberships_service_role_all" ON public.memberships
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- User vê apenas as próprias memberships (necessário pro org switcher).
-- Listagem de membros do time pra owner usa createAdminClient na API.
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
CREATE POLICY "memberships_select_own" ON public.memberships
  FOR SELECT
  USING (user_id = auth.uid());
