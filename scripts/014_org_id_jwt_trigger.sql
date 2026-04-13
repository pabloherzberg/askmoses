-- ============================================================
-- 014_org_id_jwt_trigger.sql
-- Atualiza o trigger set_role_claim para propagar org_id
-- no app_metadata do JWT, além do role já existente.
--
-- Fluxo:
--   1. profiles recebe INSERT ou UPDATE (role ou org_id)
--   2. Trigger lê profiles.role e profiles.org_id
--   3. Faz UPSERT no raw_app_meta_data de auth.users
--   4. Na próxima requisição autenticada o JWT já carrega
--      app_metadata.org_id → RLS policies filtram por ele
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_role_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role',   NEW.role,
         'org_id', NEW.org_id::text
       )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- O trigger já existe (criado em create-profiles-table.sql).
-- Recriar para garantir que aponta para a função atualizada.
DROP TRIGGER IF EXISTS on_profile_upserted ON public.profiles;
CREATE TRIGGER on_profile_upserted
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_role_claim();

-- ─── Propagação manual para usuários de demo já existentes ───────────────────
-- Dispara a função para todos os profiles que já têm org_id definido,
-- garantindo que o JWT deles seja atualizado sem necessidade de re-login.

DO $$
DECLARE
  prof RECORD;
BEGIN
  FOR prof IN
    SELECT id, role, org_id FROM public.profiles WHERE org_id IS NOT NULL
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'role',   prof.role,
           'org_id', prof.org_id::text
         )
    WHERE id = prof.id;
  END LOOP;
END;
$$;
