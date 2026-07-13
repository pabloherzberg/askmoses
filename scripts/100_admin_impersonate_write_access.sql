-- ============================================================
-- 100_admin_impersonate_write_access.sql
--
--   Reverte a decisão "Admin read-only durante impersonate"
--   (migration 040 / decisão Victor 2026-05-13). Admin impersonando
--   uma org agora tem as mesmas permissões de escrita que o Owner
--   daquela org — age como "owner efetivo" enquanto o impersonate
--   estiver ativo.
--
--   current_org_for_write() passa a espelhar current_org(): também
--   resolve pro org impersonado quando o JWT tem
--   app_metadata.impersonating_org_id setado. RLS de INSERT/UPDATE/
--   DELETE (calls, rubrics, criteria, scripts, insights,
--   marketing_runs, etc.) volta a aceitar o admin impersonando.
--
--   Real enforcement de permissão fica em requireOwnerWrite()
--   (lib/auth.ts) e nos role-guards de cada endpoint — este script é
--   só defense-in-depth no nível DB, hoje alinhado de novo com o
--   API layer.
--
-- Idempotente: pode rodar várias vezes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_org_for_write()
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
      FROM public.users u
      WHERE u.id = auth.uid()
    )
  END
$$;

COMMENT ON FUNCTION public.current_org_for_write() IS
  'Org ativa pra mutations. Espelha current_org() — Admin impersonando (app_metadata.impersonating_org_id) escreve na org alvo como owner efetivo. Real enforcement é requireOwnerWrite()/role-guards no API; isto é defense-in-depth no DB.';

REVOKE EXECUTE ON FUNCTION public.current_org_for_write() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_org_for_write() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_org() IS
  'Org ativa do user. Admin com app_metadata.impersonating_org_id retorna essa org — impersonate dá acesso de owner efetivo (leitura e escrita). Caminho normal: users.active_org_id sem re-checagem de membership (validação no API write).';
