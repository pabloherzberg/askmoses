-- ============================================================
-- 045_drop_legacy_admin_policies.sql
--
-- Causa raiz do erro 42P17 que persistiu mesmo após 042+043+044:
-- policies legadas com nomes "tabela: admin read all" que sobreviveram
-- desde antes do setup multi-tenant. O padrão delas é:
--
--   USING (
--     EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
--   )
--
-- Aplicado em users, admins, owners, trainers. O problema crítico está na
-- policy DE users que faz subquery EM users — ciclo direto, Postgres aborta
-- com infinite_recursion.
--
-- Essas policies foram o jeito antigo de "Admin global lê tudo". Pós
-- migration 040 isso é coberto por:
--   - service_role bypass (lib/db/*.ts usam createAdminClient sempre)
--   - impersonate read-only (current_org() retorna org alvo quando Admin
--     tem app_metadata.impersonating_org_id)
--
-- Drop seguro — não há código de produção dependendo dessas policies.
-- Também dropamos "users: own row" que duplicava users_select_self.
-- ============================================================

DROP POLICY IF EXISTS "users: admin read all"    ON public.users;
DROP POLICY IF EXISTS "users: own row"           ON public.users;
DROP POLICY IF EXISTS "trainers: admin read all" ON public.trainers;
DROP POLICY IF EXISTS "owners: admin read all"   ON public.owners;

-- admins table: existência incerta — se não existe, DROP POLICY com IF EXISTS
-- não falha se a TABELA não existir (a policy também não existe). Cobrimos
-- defensivamente:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admins' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "admins: admin read all" ON public.admins;
  END IF;
END $$;

-- Sanity: lista o que sobrou em users — deve ter SÓ as 2 policies que
-- adicionamos via migrations:
--   users_service_role_all (FOR ALL, auth.role() = service_role)
--   users_select_self      (FOR SELECT, id = auth.uid())

SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;
