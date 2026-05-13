-- ============================================================
-- 043_fix_current_org_recursion.sql
-- Segundo fix de recursão detectado no TC-02 (2026-05-13).
--
-- Após 042 dropar `users_select_same_org`, um SEGUNDO ciclo continuava
-- ativo via memberships:
--
--   memberships_select_by_org → current_org()
--   current_org() → SELECT FROM memberships (EXISTS check)
--                   ↑ planner detecta ciclo
--
-- O `EXISTS` em current_org() era defense-in-depth: garantia que se um
-- user tivesse `active_org_id` apontando pra uma org sem membership
-- aceita, current_org() retornaria NULL e RLS bloquearia tudo.
--
-- Trade-off: removemos o EXISTS. Confiamos que `active_org_id` é
-- consistente porque /api/me/active-org valida membership ANTES de
-- gravar (route.ts:47-56). Caminho admin-impersonate idem — POST
-- /api/admin/impersonate valida org antes de setar o claim.
--
-- Risco residual aceitável: se um Owner remover um Trainer (DELETE em
-- memberships) enquanto o Trainer está logado, o JWT do Trainer ainda
-- carrega `active_org_id` da org de onde foi removido até o próximo
-- refresh. Janela curta, mitigada pela rotação natural do JWT (1h
-- default no Supabase).
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
     AND (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id') IS NOT NULL
    THEN (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id')::uuid
    ELSE (
      SELECT u.active_org_id
      FROM   public.users u
      WHERE  u.id = auth.uid()
    )
  END
$$;

-- current_org_for_write tem o mesmo problema — versão estrita também
-- precisa perder o EXISTS. Mantém ignorando impersonate (esse é o
-- comportamento desejado pra writes).

CREATE OR REPLACE FUNCTION public.current_org_for_write()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.active_org_id
  FROM   public.users u
  WHERE  u.id = auth.uid()
$$;

-- Comentários atualizados pra refletir o novo contrato.

COMMENT ON FUNCTION public.current_org() IS
  'Org ativa do user corrente. Admin com app_metadata.impersonating_org_id setado retorna essa org (read-only — usar current_org_for_write() pra mutations). Caminho normal: users.active_org_id (sem re-verificação de membership; /api/me/active-org valida ANTES de gravar).';

COMMENT ON FUNCTION public.current_org_for_write() IS
  'Versão estrita de current_org() — ignora impersonate. Usada em policies WITH CHECK / FOR INSERT|UPDATE|DELETE. Garante que Admin impersonando NÃO consegue escrever via RLS, mesmo se o API layer esquecer requireOwnerWrite().';
