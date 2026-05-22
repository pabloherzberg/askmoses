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
-- Defensiva: usa DO $$ ... IF EXISTS $$ porque algumas colunas legadas
-- (total_criteria, criteria) podem ter sido dropadas em ambientes
-- diferentes sem migration correspondente. Sem o IF EXISTS, rodar em
-- DB sem essas colunas quebra com "column does not exist".
--
-- Idempotente — re-rodar não muda nada.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='transcript' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN transcript DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='overall_score' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN overall_score DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='summary' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN summary DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='strengths' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN strengths DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='improvements' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN improvements DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='total_criteria' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN total_criteria DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='criteria' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN criteria DROP NOT NULL;
  END IF;
END$$;
