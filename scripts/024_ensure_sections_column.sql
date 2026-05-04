-- Migration: 024_ensure_sections_column
-- Purpose: Garante a existência da coluna `calls.sections` (JSONB) usada
--          pelo Prompt v2 (Task 1.2). A migration original que cria essa
--          coluna está em `scripts/001_section_scores.sql`, mas o histórico
--          tem duplicatas de número (existem dois `001_*.sql`) e em alguns
--          ambientes ela não foi aplicada — o que quebra inserts do
--          /api/analyze com:
--            "Could not find the 'sections' column of 'calls' in the
--             schema cache".
--
--          Esta migration NÃO substitui 001_section_scores — só assegura
--          o ADD COLUMN. Se a coluna já existir (porque 001_section_scores
--          rodou antes), o `IF NOT EXISTS` torna o comando no-op.
--
--          Idempotente — pode rodar múltiplas vezes.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_sections
  ON public.calls USING GIN (sections);

-- Rollback (manual):
-- DROP INDEX IF EXISTS idx_calls_sections;
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS sections;
