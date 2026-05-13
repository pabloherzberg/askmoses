-- ============================================================
-- TC-02 — RLS bloqueia query sem JWT de tenant
--
-- Critério de aceite:
--   Quando uma query é executada via Supabase Studio sem JWT de tenant
--   específico, então o retorno é vazio ou erro de permissão e nenhum
--   dado é exposto.
--
-- Como rodar:
--   1. Abrir Supabase Studio → SQL Editor → New Query
--   2. Colar este arquivo inteiro e executar
--   3. Conferir cada bloco — todos os SELECTs em modo `anon` devem
--      retornar 0 rows (ou erro de permissão).
--
-- Importante: o SQL Editor do Supabase Studio roda por padrão como
-- `postgres` (superuser, bypassa RLS). O `SET LOCAL ROLE` muda pro
-- contexto desejado dentro da transaction — `BEGIN`/`COMMIT` envolvem
-- cada bloco pra isolar os SETs.
-- ============================================================

-- ─── 0. Sanity: confirma que RLS está habilitado em todas as tabelas ────
-- Sem isso, o teste é inútil — se relrowsecurity=false a tabela é open
-- regardless. Esperado: TRUE pra todas as listadas.
-- `rowsecurity` está em pg_tables (boolean), mas `forcerowsecurity` só
-- existe em pg_class.relforcerowsecurity — por isso usamos pg_class direto
-- e fazemos JOIN com pg_namespace pra filtrar schema.
SELECT
  n.nspname  AS schemaname,
  c.relname  AS tablename,
  c.relrowsecurity      AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'organizations', 'users', 'trainers', 'memberships',
    'calls', 'rubrics', 'criteria', 'scripts',
    'insights', 'marketing_runs', 'invite_tokens',
    'admin_impersonations', 'owners'
  )
ORDER BY c.relname;
-- Esperado: rls_enabled = true em todas. invite_tokens e admin_impersonations
-- também devem ter rls_forced = true (lockdown total).

-- ============================================================
-- TESTE A — Role `anon` (visitante sem login)
-- ============================================================
-- auth.uid() retorna NULL → policies que usam `id = auth.uid()` falham.
-- auth.jwt() retorna {} → current_org() retorna NULL → policies por org falham.
-- Esperado: 0 rows em todas as tabelas tenant-scoped.

BEGIN;
SET LOCAL ROLE anon;

-- UNION ALL pra Supabase Studio mostrar tudo num único result set.
-- Esperado: rows=0 em TODAS as tabelas tenant; plans > 0 (public_read).
SELECT 'anon → calls'          AS scope, count(*)::bigint AS rows FROM public.calls
UNION ALL SELECT 'anon → rubrics',           count(*)::bigint FROM public.rubrics
UNION ALL SELECT 'anon → criteria',          count(*)::bigint FROM public.criteria
UNION ALL SELECT 'anon → scripts',           count(*)::bigint FROM public.scripts
UNION ALL SELECT 'anon → insights',          count(*)::bigint FROM public.insights
UNION ALL SELECT 'anon → marketing_runs',    count(*)::bigint FROM public.marketing_runs
UNION ALL SELECT 'anon → organizations',     count(*)::bigint FROM public.organizations
UNION ALL SELECT 'anon → users',             count(*)::bigint FROM public.users
UNION ALL SELECT 'anon → trainers',          count(*)::bigint FROM public.trainers
UNION ALL SELECT 'anon → memberships',       count(*)::bigint FROM public.memberships
UNION ALL SELECT 'anon → owners',            count(*)::bigint FROM public.owners
UNION ALL SELECT 'anon → plans (public_read)', count(*)::bigint FROM public.plans
ORDER BY scope;

-- Lockdown total: invite_tokens + admin_impersonations têm REVOKE ALL
-- FROM anon/authenticated (migrations 034 e 041) — não é RLS filtrando,
-- é GRANT negado no nível Postgres. Comportamento esperado é ERROR
-- "42501: permission denied", mais forte que "0 rows".
-- DO blocks capturam a exceção e logam como sucesso (ver aba "Messages").
DO $$
BEGIN
  PERFORM count(*) FROM public.invite_tokens;
  RAISE NOTICE 'anon → invite_tokens: SELECT permitido (FALHA — lockdown não está ativo)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'anon → invite_tokens: permission denied (OK — lockdown ativo)';
END $$;

DO $$
BEGIN
  PERFORM count(*) FROM public.admin_impersonations;
  RAISE NOTICE 'anon → admin_impersonations: SELECT permitido (FALHA — lockdown não está ativo)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'anon → admin_impersonations: permission denied (OK — lockdown ativo)';
END $$;

ROLLBACK;

-- ============================================================
-- TESTE B — Role `authenticated` SEM claims de JWT
-- ============================================================
-- Simula token JWT vazio: auth.uid() volta NULL, current_org() volta NULL.
-- Comportamento esperado é idêntico ao anon — sem identidade, RLS bloqueia.

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{}';

SELECT 'auth(no-jwt) → calls'         AS scope, count(*)::bigint AS rows FROM public.calls
UNION ALL SELECT 'auth(no-jwt) → rubrics',        count(*)::bigint FROM public.rubrics
UNION ALL SELECT 'auth(no-jwt) → organizations',  count(*)::bigint FROM public.organizations
UNION ALL SELECT 'auth(no-jwt) → users',          count(*)::bigint FROM public.users
UNION ALL SELECT 'auth(no-jwt) → trainers',       count(*)::bigint FROM public.trainers
ORDER BY scope;

ROLLBACK;

-- ============================================================
-- TESTE C — current_org() retorna NULL sem JWT válido
-- ============================================================
-- Sanity check da função que sustenta as RLS policies. Sem JWT com
-- impersonating_org_id E sem active_org_id válido, retorna NULL.

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{}';
SELECT
  public.current_org()           AS current_org_when_anon_jwt,
  public.current_org_for_write() AS current_org_for_write_when_anon_jwt;
ROLLBACK;

-- ============================================================
-- TESTE D — Sanity reverso (controle positivo)
-- ============================================================
-- Confirma que o problema NÃO é a tabela estar vazia, e sim a policy
-- bloqueando. Como service_role bypassa RLS, deve voltar > 0 se há dados.

SELECT 'service_role → calls'   AS scope, count(*)::bigint AS rows FROM public.calls
UNION ALL SELECT 'service_role → rubrics', count(*)::bigint FROM public.rubrics
ORDER BY scope;
-- Esperado: se há dados seeded, > 0. Compare com os 0 dos blocos A/B.

-- ============================================================
-- RESULTADO ESPERADO (resumo)
-- ============================================================
-- Bloco 0:  rls_enabled = true pra todas as tabelas listadas.
-- Bloco A:  TODAS as queries → 0 rows, EXCETO:
--             - `plans` (intencional, public_read)
--             - `invite_tokens` + `admin_impersonations` retornam NOTICE
--               "permission denied (OK — lockdown ativo)". Mais forte que
--               0 rows: o GRANT é negado, não chega a avaliar RLS.
-- Bloco B:  Mesmo de A — anon e authenticated-sem-jwt se comportam igual.
-- Bloco C:  current_org() = NULL e current_org_for_write() = NULL.
-- Bloco D:  service_role retorna os totais reais (controle positivo).
--
-- Se QUALQUER linha do bloco A ou B voltar > 0 (exceto plans), é vazamento
-- e o TC-02 falha — abre issue.
