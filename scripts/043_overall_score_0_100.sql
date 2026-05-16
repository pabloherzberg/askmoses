-- ============================================================
-- 043_overall_score_0_100.sql
--
-- Problema: calls.overall_score guardava 0–5 (capado por outcome
-- em OUTCOME_OVERALL_CAP em lib/constants.ts) enquanto
-- calls.sections[].score (JSONB) guardava 0–100 (output cru do
-- LLM). Isso fazia o mesmo objeto Call ter campos em escalas
-- diferentes — fonte do bug "0.1, 0.2" no dashboard.
--
-- Solução: migrar overall_score para 0–100. Backfill multiplica
-- as linhas existentes por 20. Coluna continua NUMERIC(3,1) para
-- aceitar valores até 100.0.
--
-- Ordem de deploy (lib/constants.ts e app/api/analyze/route.ts
-- vão junto): este script primeiro, depois o deploy de código.
-- Durante a janela entre os dois, a heurística `s > 5 ? s/20 : s`
-- em lib/services/calls.ts cobre — todos os valores no DB ficam
-- > 5 após o backfill, e a divisão por 20 reproduz a escala antiga.
-- ============================================================

-- Passo 1: dropar view dependente. calls_ml_flat (script 036) referencia
-- overall_score, então PostgreSQL bloqueia o ALTER TYPE. A view é recriada
-- idêntica no passo 4.
DROP VIEW IF EXISTS public.calls_ml_flat;

-- Passo 2: expandir o tipo ANTES de fazer o UPDATE.
-- NUMERIC(3,1) só comporta até 99.9 — multiplicar 5.0 por 20 daria 100.0
-- e estouraria o tipo. Subir para NUMERIC(4,1) primeiro acomoda 100.0.
ALTER TABLE public.calls
  ALTER COLUMN overall_score TYPE NUMERIC(4,1) USING overall_score::numeric;

-- Passo 3: backfill — linhas pré-migração têm overall_score em [0, 5].
-- Linhas pós-migração já serão escritas em [0, 100], mas o
-- predicado <= 5 garante que esse script é idempotente.
UPDATE public.calls
SET overall_score = ROUND((overall_score * 20)::numeric, 1)
WHERE overall_score IS NOT NULL AND overall_score <= 5;

-- Passo 4: recriar calls_ml_flat (definição idêntica ao script 036).
CREATE OR REPLACE VIEW public.calls_ml_flat AS
SELECT
  c.id,
  c.org_id,
  c.trainer_id,
  c.trainer_name,
  c.trainer_email,
  c.call_date,
  c.created_at                                      AS uploaded_at,
  c.duration_seconds,
  c.overall_score,
  c.closed,
  c.call_outcome,
  c.detected_outcome,
  c.model_used,
  c.prompt_version,
  c.cost_usd,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%discovery%'
    LIMIT 1
  )                                                 AS score_discovery,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%problem%'
    LIMIT 1
  )                                                 AS score_problem_agitation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%offer%'
       OR lower(elem->>'name') LIKE '%presentation%'
    LIMIT 1
  )                                                 AS score_offer_presentation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%objection%'
    LIMIT 1
  )                                                 AS score_objection_handling,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%close%'
       OR lower(elem->>'name') LIKE '%next%'
    LIMIT 1
  )                                                 AS score_close_next_steps

FROM public.calls c
WHERE c.sections IS NOT NULL;

COMMENT ON VIEW public.calls_ml_flat IS
  'Desnormalização de calls para pipeline ML. '
  'Cada linha = 1 call com scores por dimensão em colunas escalares. '
  'Respeita RLS da tabela calls. '
  'Calls sem sections (legadas) são excluídas.';

-- Passo 5: constraint de range. DROP IF EXISTS porque 033 não criou nenhuma.
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_overall_score_range;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_overall_score_range
  CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100));
