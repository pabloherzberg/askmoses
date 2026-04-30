-- ============================================================
-- 020_users_invite_fields.sql
-- Adiciona campos de convite à tabela public.users:
--   - org_id        → vincula owner/admin à organização (trainers
--                     já estão vinculados via public.trainers.org_id,
--                     mas owners/admins não tinham coluna própria)
--   - invited_by    → quem disparou o convite (FK → users.id)
--   - invited_at    → quando o convite foi enviado
--   - invite_status → 'pending' (link enviado) | 'accepted' (já fez login + senha)
--
-- Backfill: registros existentes são marcados como 'accepted'
-- (são os usuários demo, já ativos). O default passa a ser
-- 'pending' para forçar o fluxo correto em novos convites.
-- ============================================================

-- ─── 1. Novas colunas ────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS org_id        UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_by    UUID REFERENCES public.users(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_status TEXT;

CREATE INDEX IF NOT EXISTS users_org_id_idx        ON public.users(org_id);
CREATE INDEX IF NOT EXISTS users_invited_by_idx    ON public.users(invited_by);
CREATE INDEX IF NOT EXISTS users_invite_status_idx ON public.users(invite_status);

-- ─── 2. Backfill ─────────────────────────────────────────────────────────────

-- 2a. Trainers herdam org_id da row em public.trainers
UPDATE public.users u
SET    org_id = t.org_id
FROM   public.trainers t
WHERE  t.user_id = u.id
  AND  u.org_id IS NULL
  AND  t.org_id IS NOT NULL;

-- 2b. Owners herdam org_id via owners → clients (owners.company = clients.name)
UPDATE public.users u
SET    org_id = c.org_id
FROM   public.owners o
JOIN   public.clients c ON c.name = o.company
WHERE  u.id = o.user_id
  AND  u.org_id IS NULL
  AND  u.role = 'owner';

-- 2c. Admin fica com org_id = NULL (admin global, não pertence a uma org)

-- 2d. Todos os usuários existentes são considerados aceitos
UPDATE public.users
SET    invite_status = 'accepted'
WHERE  invite_status IS NULL;

-- ─── 3. Defaults e constraints ───────────────────────────────────────────────

ALTER TABLE public.users
  ALTER COLUMN invite_status SET DEFAULT 'pending';

ALTER TABLE public.users
  ALTER COLUMN invite_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_invite_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_invite_status_check
      CHECK (invite_status IN ('pending', 'accepted'));
  END IF;
END;
$$;
