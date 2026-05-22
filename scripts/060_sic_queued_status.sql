-- ============================================================
-- 060_sic_queued_status.sql
-- Adiciona 'queued' ao CHECK de analysis_status para suportar
-- envio sequencial: orgs na fila aguardam a anterior terminar.
-- ============================================================

-- Remove o constraint antigo e recria com 'queued' incluído.
ALTER TABLE public.script_intelligence_cache
  DROP CONSTRAINT IF EXISTS script_intelligence_cache_analysis_status_check;

ALTER TABLE public.script_intelligence_cache
  ADD CONSTRAINT script_intelligence_cache_analysis_status_check
    CHECK (analysis_status IN ('queued', 'processing', 'ready', 'error'));

COMMENT ON COLUMN public.script_intelligence_cache.analysis_status IS
  'queued = na fila aguardando | processing = IA rodando | ready = resultado disponível | error = falha';
