-- ============================================================
-- 072_fix_owners_user_id_fk.sql
--
-- Conserta a FK ausente owners.user_id -> users.id em produção.
--
-- Causa: __bootstrap_prd.sql tinha DUAS definições `CREATE TABLE IF NOT EXISTS
-- public.owners`; a primeira (no bloco 020_make_rubric_id_nullable, fora de
-- lugar) criava `user_id UUID` SEM `REFERENCES public.users(id)`. Por rodar
-- antes da definição correta (bloco 021_fix_schema_gaps, com a FK), o banco
-- provisionado pelo bootstrap nasceu sem a constraint — a segunda definição
-- virou no-op por causa do IF NOT EXISTS.
--
-- Sintoma: GET /api/organizations (popula os dropdowns de org no "Members" do
-- admin) faz embed PostgREST `users!inner` sobre `owners`. Sem a FK, o
-- PostgREST não resolve a relação (PGRST200) e a rota responde 500. O SAAS
-- Panel (/api/admin/organizations/list) não usa esse join — usa memberships —
-- por isso seguia funcionando. Dev funciona porque seu schema foi montado pelas
-- migrations numeradas em ordem (021 cria owners já com a FK).
--
-- Idempotente: só adiciona a FK se ainda não existir. Usa NOT VALID para não
-- falhar caso existam owners órfãos legados (user_id sem match em users); a
-- validação roda em seguida de forma tolerante. Uma FK NOT VALID já é suficiente
-- para o PostgREST detectar a relação e resolver o embed users!inner.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.owners'::regclass
      AND contype  = 'f'
      AND conname  = 'owners_user_id_fkey'
  ) THEN
    ALTER TABLE public.owners
      ADD CONSTRAINT owners_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

-- Valida as linhas existentes. Se houver órfão legado, apenas avisa e segue —
-- a FK (mesmo NOT VALID) já basta para destravar o embed users!inner.
-- Só toleramos foreign_key_violation (órfãos); qualquer outra falha
-- (lock_timeout, permissão, constraint inexistente) propaga para não mascarar
-- uma validação que nem chegou a rodar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.owners'::regclass
      AND contype  = 'f'
      AND conname  = 'owners_user_id_fkey'
      AND NOT convalidated
  ) THEN
    ALTER TABLE public.owners VALIDATE CONSTRAINT owners_user_id_fkey;
  END IF;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'owners_user_id_fkey não validada (órfãos em owners.user_id?): %', SQLERRM;
END $$;
