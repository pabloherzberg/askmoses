-- ============================================================
-- 105_call_outcome_2_values.sql
-- Simplifica call_outcome_enum de 4 valores para 2.
--
-- Mapeamento (4 → 2):
--   closed      → closed       (sem mudança)
--   partial     → closed       (avançou parcialmente = "fechou algo")
--   not_closed  → not_closed   (sem mudança)
--   no_outcome  → not_closed   (resultado ambíguo = "de fato não fechou")
--
-- Também remapeia organizations.stage1_success_outcomes (TEXT[] livre,
-- não é enum) para os 2 valores canônicos, deduplicando.
--
-- Não altera calls.closed nem o trigger sync_closed_from_outcome (036) —
-- a lógica `closed = (call_outcome = 'closed')` continua correta.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Remapear dados existentes ANTES do cast ─────────────────────────────
-- Idempotente: se já foi remapeado antes, o WHERE não casa nada.
UPDATE public.calls SET call_outcome = 'closed'     WHERE call_outcome = 'partial';
UPDATE public.calls SET call_outcome = 'not_closed' WHERE call_outcome = 'no_outcome';

UPDATE public.calls SET detected_outcome = 'closed'     WHERE detected_outcome = 'partial';
UPDATE public.calls SET detected_outcome = 'not_closed' WHERE detected_outcome = 'no_outcome';

-- ─── 2. Swap do enum (Postgres não suporta DROP VALUE) ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'call_outcome_enum_v2'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.call_outcome_enum_v2 AS ENUM (
      'closed',
      'not_closed'
    );
  END IF;
END $$;

ALTER TABLE public.calls
  ALTER COLUMN call_outcome TYPE public.call_outcome_enum_v2
  USING call_outcome::text::public.call_outcome_enum_v2;

ALTER TABLE public.calls
  ALTER COLUMN detected_outcome TYPE public.call_outcome_enum_v2
  USING detected_outcome::text::public.call_outcome_enum_v2;

DROP TYPE IF EXISTS public.call_outcome_enum;
ALTER TYPE public.call_outcome_enum_v2 RENAME TO call_outcome_enum;

-- ─── 3. Remapear organizations.stage1_success_outcomes (TEXT[] livre) ───────
-- Substitui valores legados dentro do array e deduplica.
UPDATE public.organizations
SET stage1_success_outcomes = (
  SELECT array_agg(DISTINCT mapped)
  FROM unnest(stage1_success_outcomes) AS raw(val)
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN raw.val = 'partial'    THEN 'closed'
      WHEN raw.val = 'no_outcome' THEN 'not_closed'
      ELSE raw.val
    END AS mapped
  ) AS m
)
WHERE stage1_success_outcomes && ARRAY['partial', 'no_outcome']::text[];

-- Rollback (manual, sem restaurar os 4 valores originais — dado já remapeado):
-- CREATE TYPE public.call_outcome_enum_v1 AS ENUM ('closed', 'not_closed', 'partial', 'no_outcome');
-- ALTER TABLE public.calls ALTER COLUMN call_outcome TYPE public.call_outcome_enum_v1 USING call_outcome::text::public.call_outcome_enum_v1;
-- ALTER TABLE public.calls ALTER COLUMN detected_outcome TYPE public.call_outcome_enum_v1 USING detected_outcome::text::public.call_outcome_enum_v1;
-- DROP TYPE IF EXISTS public.call_outcome_enum;
-- ALTER TYPE public.call_outcome_enum_v1 RENAME TO call_outcome_enum;
