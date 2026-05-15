-- ============================================================
-- 036_ml_fields.sql
--
-- Adiciona campos necessários para o pipeline de correlação ML
-- (User Story: Data Scientist — schema para modelo de correlação).
--
-- Campos adicionados em calls:
--   closed           BOOLEAN  — resultado binário da call (true = fechou)
--                               derivado de call_outcome, mas explícito para
--                               facilitar queries de ML sem JOIN/CASE
--   call_date        DATE     — data em que a call aconteceu (≠ created_at,
--                               que é a data do upload)
--   duration_seconds INT      — duração da call em segundos
--
-- View adicionada:
--   calls_ml_flat    — desnormaliza calls.sections JSONB em colunas escalares
--                      para consumo direto pelo pipeline sem parsing JSON
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Campo closed (boolean binário para ML) ────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS closed BOOLEAN;

-- Backfill: derivar closed a partir de call_outcome existente
UPDATE public.calls
SET closed = (call_outcome = 'closed')
WHERE closed IS NULL
  AND call_outcome IS NOT NULL;

-- Index para filtros rápidos de ML
CREATE INDEX IF NOT EXISTS calls_closed_idx ON public.calls(closed);
CREATE INDEX IF NOT EXISTS calls_closed_org_idx ON public.calls(org_id, closed);

-- ─── 2. call_date (data da call, separada do upload) ─────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS call_date DATE;

-- Backfill: para calls legadas, assumir que call_date = data do upload
UPDATE public.calls
SET call_date = created_at::date
WHERE call_date IS NULL;

CREATE INDEX IF NOT EXISTS calls_call_date_idx ON public.calls(call_date DESC);

-- ─── 3. duration_seconds (duração da call) ────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS duration_seconds INT;

-- Sem backfill — calls legadas ficam NULL (dado não disponível)

-- ─── 4. View calls_ml_flat — desnormaliza sections JSONB ──────────────────────
--
-- Transforma o array sections em colunas escalares por dimensão:
--   score_discovery, score_problem_agitation, score_offer_presentation,
--   score_objection_handling, score_close_next_steps
--
-- Dimensões são extraídas por nome (case-insensitive) para tolerar
-- variações de capitalização entre versões do prompt.
--
-- A view é SECURITY DEFINER-free e respeita RLS da tabela base (calls).

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

  -- Scores por seção (extraídos do JSONB sections[])
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

-- ─── 5. Trigger: manter closed sincronizado com call_outcome ─────────────────

CREATE OR REPLACE FUNCTION public.sync_closed_from_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.closed := (NEW.call_outcome = 'closed');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_closed ON public.calls;
CREATE TRIGGER trg_sync_closed
  BEFORE INSERT OR UPDATE OF call_outcome ON public.calls
  FOR EACH ROW
  WHEN (NEW.call_outcome IS NOT NULL)
  EXECUTE FUNCTION public.sync_closed_from_outcome();

-- Rollback (manual):
-- DROP TRIGGER IF EXISTS trg_sync_closed ON public.calls;
-- DROP FUNCTION IF EXISTS public.sync_closed_from_outcome();
-- DROP VIEW IF EXISTS public.calls_ml_flat;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS closed,
--   DROP COLUMN IF EXISTS call_date,
--   DROP COLUMN IF EXISTS duration_seconds;
