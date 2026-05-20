-- ============================================================
-- 045_org_scripts_service_role_policy.sql
--
-- Adiciona policy explícita de service_role em org_scripts, alinhada
-- com o padrão usado pelas outras tabelas (organizations, scripts,
-- memberships, etc. — ver migrations 012, 027, 040).
--
-- Migration 044 só fez ENABLE RLS sem criar policy, contando com o fato
-- de que service_role bypassa RLS por default no Supabase. Funciona,
-- mas: (a) diverge da convenção do projeto, (b) auditoria de segurança
-- fica mais clara quando a intenção é explícita. Sem a policy, qualquer
-- acesso via anon/auth keys é bloqueado — comportamento desejado pois
-- todos os endpoints que mexem em org_scripts usam createAdminClient.
--
-- Idempotente — DROP IF EXISTS antes de CREATE.
-- ============================================================

DROP POLICY IF EXISTS "org_scripts_service_role_all" ON public.org_scripts;

CREATE POLICY "org_scripts_service_role_all" ON public.org_scripts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
