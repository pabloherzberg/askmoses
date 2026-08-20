-- ============================================================
-- schema-fingerprint.sql
-- Compara o schema de dois bancos (dev x prod) para achar o que faltou rodar.
--
-- COMO USAR: rode a query 1 no SQL editor de CADA banco e compare as duas
-- saídas. Onde o fingerprint diferir, rode a query 2 filtrando por aquela
-- tabela para ver a coluna exata.
--
-- Não altera nada. Só lê catálogo.
-- ============================================================


-- ─── 1. Triagem: uma linha por tabela ───────────────────────────────────────
-- Saída curta (~25 linhas). Compare lado a lado: tabela que existe só de um
-- lado, ou fingerprint diferente, é onde mora a divergência.

SELECT table_name,
       COUNT(*) AS colunas,
       MD5(STRING_AGG(
         column_name || ':' || data_type || ':' || is_nullable,
         ',' ORDER BY column_name
       )) AS fingerprint
FROM   information_schema.columns
WHERE  table_schema = 'public'
GROUP  BY table_name
ORDER  BY table_name;


-- ─── 2. Detalhe de uma tabela ───────────────────────────────────────────────
-- Troque 'trainers' pela tabela que divergiu na query 1.

-- SELECT column_name, data_type, is_nullable, column_default
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public' AND table_name = 'trainers'
-- ORDER  BY column_name;


-- ─── 3. Constraints, índices, funções e triggers ────────────────────────────
-- A query 1 só olha colunas. Constraint e índice não aparecem nela — e é
-- justamente onde diferenças silenciosas se escondem (um UNIQUE que existe
-- num banco e não no outro não muda nenhum fingerprint acima).

-- SELECT 'CONSTRAINT' AS tipo,
--        conrelid::regclass::text AS objeto,
--        conname AS nome,
--        pg_get_constraintdef(oid) AS definicao
-- FROM   pg_constraint c
-- JOIN   pg_namespace n ON n.oid = c.connamespace
-- WHERE  n.nspname = 'public'
-- UNION ALL
-- SELECT 'INDEX', tablename, indexname, indexdef
-- FROM   pg_indexes WHERE schemaname = 'public'
-- UNION ALL
-- SELECT 'FUNCTION', 'public', p.proname,
--        p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
-- FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE  n.nspname = 'public'
-- UNION ALL
-- SELECT 'TRIGGER', tgrelid::regclass::text, tgname, pg_get_triggerdef(oid)
-- FROM   pg_trigger
-- WHERE  NOT tgisinternal
--   AND  tgrelid IN (
--         SELECT c.oid FROM pg_class c
--         JOIN pg_namespace n ON n.oid = c.relnamespace
--         WHERE n.nspname = 'public')
-- ORDER  BY tipo, objeto, nome;


-- ─── 4. O caso concreto que apareceu ────────────────────────────────────────
-- trainers.user_id é NOT NULL num banco e nenhum script em scripts/ cria essa
-- constraint. Rode isto nos dois para saber se a divergência é entre os
-- bancos, ou entre os bancos e o repositório.

-- SELECT current_database() AS banco, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'trainers'
--   AND  column_name  = 'user_id';
