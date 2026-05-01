-- ============================================================
-- 022_call_outcome_enum.sql
-- Converte call_outcome e detected_outcome de TEXT+CHECK para
-- ENUM nativo do Postgres (call_outcome_enum).
--
-- Mapeamento de valores legados (6 → 4):
--   closed                → closed
--   not_closed            → not_closed
--   partial               → partial
--   follow_up             → partial      (proposta com follow-up pendente)
--   objection_unresolved  → not_closed   (call completa, não fechou)
--   no_decision           → no_outcome   (sem resolução clara)
--   NULL                  → NULL         (DoD: NULL aceito)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Criar o tipo ENUM ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_outcome_enum') THEN
    CREATE TYPE public.call_outcome_enum AS ENUM (
      'closed',
      'not_closed',
      'partial',
      'no_outcome'
    );
  END IF;
END $$;

-- ─── 2. Remover CHECK constraints antigos ────────────────────────────────────
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_call_outcome_check;
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_detected_outcome_check;

-- ─── 3. Remover DEFAULT antigo (texto) — incompatível com cast pra ENUM ─────
ALTER TABLE public.calls ALTER COLUMN call_outcome DROP DEFAULT;

-- ─── 4. Mapear valores legados antes do cast ─────────────────────────────────
-- Idempotente: se já foi mapeado antes, o WHERE não casa nada.
UPDATE public.calls SET call_outcome = 'partial'    WHERE call_outcome = 'follow_up';
UPDATE public.calls SET call_outcome = 'not_closed' WHERE call_outcome = 'objection_unresolved';
UPDATE public.calls SET call_outcome = 'no_outcome' WHERE call_outcome = 'no_decision';

UPDATE public.calls SET detected_outcome = 'partial'    WHERE detected_outcome = 'follow_up';
UPDATE public.calls SET detected_outcome = 'not_closed' WHERE detected_outcome = 'objection_unresolved';
UPDATE public.calls SET detected_outcome = 'no_outcome' WHERE detected_outcome = 'no_decision';

-- ─── 5. ALTER COLUMN para o tipo ENUM ────────────────────────────────────────
-- Se já for ENUM (re-execução), o cast é no-op.
ALTER TABLE public.calls
  ALTER COLUMN call_outcome TYPE public.call_outcome_enum
  USING call_outcome::text::public.call_outcome_enum;

ALTER TABLE public.calls
  ALTER COLUMN detected_outcome TYPE public.call_outcome_enum
  USING detected_outcome::text::public.call_outcome_enum;
