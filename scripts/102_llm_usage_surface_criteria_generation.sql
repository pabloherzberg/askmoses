-- 102_llm_usage_surface_criteria_generation.sql
--
-- Adiciona a surface 'criteria_generation' ao CHECK de llm_usage_events.surface.
-- Nova surface usada por POST /api/generate-criteria (geração de critérios de
-- rubrica via LLM — antes era mock). Sem isso, recordLlmUsage falha com
-- llm_usage_events_surface_check (non-fatal, mas polui os logs).
--
-- Idempotente: dropa e recria o CHECK (mesmo padrão de 089_llm_usage_events.sql).
-- Mantém TODAS as surfaces já permitidas + a nova. Manter em sincronia com
-- LlmSurface em lib/services/llm-usage.ts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'llm_usage_events_surface_check'
      AND conrelid = 'public.llm_usage_events'::regclass
  ) THEN
    ALTER TABLE public.llm_usage_events DROP CONSTRAINT llm_usage_events_surface_check;
  END IF;

  ALTER TABLE public.llm_usage_events
    ADD CONSTRAINT llm_usage_events_surface_check
    CHECK (surface IN (
      'analyze', 'transcription', 'diarization', 'marketing', 'insights',
      'coaching', 'translation', 'script_generation', 'criteria_generation',
      'script_improve', 'script_gap', 'script_intelligence'
    ));
END$$;
