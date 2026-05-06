-- ============================================================
-- 033_overall_score_numeric.sql
--
-- Problema: calls.overall_score estava como INT (criado em
-- 003_create_calls_table.sql), mas o cálculo em /api/analyze
-- (Math.round(avg * 10) / 10) produz um decimal de 1 casa em
-- [0.0, 5.0] (ex.: 4.6, 3.9). Isso fazia o INSERT estourar com
-- "invalid input syntax for type integer: \"4.6\"".
--
-- Solução: converter overall_score para NUMERIC(3,1). O cast de
-- INT → NUMERIC(3,1) é seguro para os valores existentes (que
-- estavam todos no range 0–5 mesmo armazenados como int).
-- ============================================================

ALTER TABLE public.calls
  ALTER COLUMN overall_score TYPE NUMERIC(3,1) USING overall_score::numeric;
