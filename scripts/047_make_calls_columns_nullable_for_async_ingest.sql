-- ============================================================
-- 047_make_calls_columns_nullable_for_async_ingest.sql
--
-- O pipeline GHL insere a linha em `calls` ANTES do Whisper/scoring
-- rodar (a linha entra como processing_status='pending' e os campos
-- são preenchidos depois). As colunas abaixo eram NOT NULL no schema
-- original (003_create_calls_table.sql), o que bloqueia o INSERT
-- assíncrono. Tornar tudo nullable.
--
-- Padrão idêntico ao 020 (que tornou rubric_id nullable).
--
-- Idempotente — ALTER COLUMN DROP NOT NULL é no-op se já é nullable.
-- ============================================================

ALTER TABLE public.calls
  ALTER COLUMN transcript      DROP NOT NULL,
  ALTER COLUMN overall_score   DROP NOT NULL,
  ALTER COLUMN total_criteria  DROP NOT NULL,
  ALTER COLUMN criteria        DROP NOT NULL,
  ALTER COLUMN summary         DROP NOT NULL,
  ALTER COLUMN strengths       DROP NOT NULL,
  ALTER COLUMN improvements    DROP NOT NULL;
