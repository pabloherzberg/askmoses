-- ============================================================
-- 056_calls_script_id.sql
--
-- Vincula cada call ao script usado na análise.
--   1. Adiciona calls.script_id (FK -> scripts, nullable, SET NULL on delete)
--   2. Garante 2 scripts na org de demo pra o filtro de /calls ter variedade
--   3. Backfill: distribui as calls existentes da org de demo entre os 2
--      scripts (corte por data — conta a história de uma troca de script)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Coluna script_id em calls ───────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS script_id UUID
    REFERENCES public.scripts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.calls.script_id IS
  'Script usado na análise desta call. NULL = call analisada por rubric (sem script) ou anterior a esta migration.';

CREATE INDEX IF NOT EXISTS idx_calls_script_id ON public.calls(script_id);

-- ─── 2. Scripts da org de demo ──────────────────────────────────────────
-- A org de demo (...100) precisa de >= 2 scripts pra o filtro de /calls ser
-- demonstrável. Reusa a rubric das próprias calls da org pra manter script e
-- call na mesma rubric. IDs fixos -> backfill determinístico abaixo.
--   ...05a1 = Discovery-First Sales Script  (is_active = TRUE  — script atual)
--   ...05a2 = Objection Handling Script     (is_active = FALSE — script legado)

INSERT INTO public.scripts
  (id, org_id, rubric_id, name, description, sections, is_active, created_at)
SELECT
  v.id,
  '00000000-0000-0000-0000-000000000100'::uuid,
  (SELECT rubric_id FROM public.calls
     WHERE org_id = '00000000-0000-0000-0000-000000000100'
       AND rubric_id IS NOT NULL
     ORDER BY created_at LIMIT 1),
  v.name,
  v.description,
  '[]'::jsonb,
  v.is_active,
  v.created_at
FROM (
  VALUES
    ('000000000000000000000000000005a1'::uuid,
     'Discovery-First Sales Script',
     'Discovery-first script — deep discovery before presenting the offer. Currently the active team script.',
     TRUE,
     '2026-04-07T12:00:00Z'::timestamptz),
    ('000000000000000000000000000005a2'::uuid,
     'Objection Handling Script',
     'Legacy script focused on price/time objection handling. Replaced by the Discovery-First script.',
     FALSE,
     '2026-02-01T12:00:00Z'::timestamptz)
) AS v(id, name, description, is_active, created_at)
WHERE EXISTS (
  SELECT 1 FROM public.calls
   WHERE org_id = '00000000-0000-0000-0000-000000000100'
     AND rubric_id IS NOT NULL
)
ON CONFLICT (id) DO UPDATE SET
  org_id      = EXCLUDED.org_id,
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active;

-- ─── 3. Backfill das calls da org de demo ───────────────────────────────
-- Corte em 2026-04-07: calls a partir dessa data usaram o script atual
-- (Discovery-First); calls anteriores usaram o script legado. Só preenche
-- onde script_id ainda é NULL — re-rodar não sobrescreve dados reais.

UPDATE public.calls
SET script_id = CASE
  WHEN created_at >= '2026-04-07T00:00:00Z'
    THEN '000000000000000000000000000005a1'::uuid
  ELSE '000000000000000000000000000005a2'::uuid
END
WHERE org_id = '00000000-0000-0000-0000-000000000100'
  AND script_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.scripts
     WHERE id = '000000000000000000000000000005a1'::uuid
  );
