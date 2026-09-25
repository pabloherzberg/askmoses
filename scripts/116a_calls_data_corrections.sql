-- ============================================================
-- 116a_calls_data_corrections.sql
--
-- VERSIONAMENTO RETROATIVO. A tabela JÁ EXISTE em produção desde antes de
-- 17/09/2026 (a primeira linha é de 110_recalc_intent). Foi criada à mão no
-- SQL Editor, no mesmo script que adicionou calls.scoring_status, e esse
-- script nunca entrou no repo — assim como as correções 111–116 que gravam
-- nela. Este arquivo existe para que outro ambiente (dev) chegue à mesma
-- estrutura, e para que a 117, que escreve aqui, tenha a dependência no repo.
--
-- Fonte: catálogo de prod lido em 25/09/2026 (pg_attribute, pg_constraint,
-- pg_indexes, pg_class, pg_policies, role_table_grants) + o texto do CREATE
-- original em pg_stat_statements. O nome "116a" só encaixa na sequência antes
-- da 117; a tabela é mais antiga que isso.
--
-- ACESSO: RLS ligado e NENHUMA policy — só service_role (que ignora RLS)
-- lê ou escreve. anon e authenticated não têm grant nenhum. É o estado de
-- prod; nada aqui abre acesso novo.
--
-- Idempotente: IF NOT EXISTS, e REVOKE/GRANT/COMMENT podem repetir.
-- Em prod, rodar este arquivo não muda nada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calls_data_corrections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID NOT NULL REFERENCES public.calls(id),
  column_name TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  applied_by  TEXT NOT NULL,          -- nome do script, ex: '110_recalc_intent'
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_data_corrections_call_id
  ON public.calls_data_corrections USING btree (call_id);

-- Em prod, "Added by Supabase: enable Row Level Security on newly created tables".
ALTER TABLE public.calls_data_corrections ENABLE ROW LEVEL SECURITY;

-- Sem policies em prod, de propósito: nenhum papel além de service_role acessa.
-- O Supabase concede tudo a anon/authenticated por default privileges em
-- tabela nova; prod não tem esses grants, então são revogados aqui.
REVOKE ALL ON public.calls_data_corrections FROM PUBLIC, anon, authenticated, service_role;
-- Lista explícita, igual à de prod: no PG17 "ALL" incluiria MAINTAIN, que o
-- service_role de prod não tem.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.calls_data_corrections TO service_role;

COMMENT ON TABLE public.calls_data_corrections IS
  'Trilha de auditoria de correções manuais em calls. Toda correção de dado grava old_value/new_value aqui antes do UPDATE. Append-only por convenção.';

-- ── Rollback ────────────────────────────────────────────────
-- (não rodar em prod — a tabela tem a trilha de 110–118)
-- DROP TABLE IF EXISTS public.calls_data_corrections;
