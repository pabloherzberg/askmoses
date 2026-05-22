-- ============================================================
-- 059_sic_analysis_status.sql
-- Adiciona analysis_status à tabela script_intelligence_cache.
-- Permite que o admin dispare a análise no envio e o owner
-- veja "Analisando..." enquanto a IA processa.
-- ============================================================

ALTER TABLE public.script_intelligence_cache
  ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (analysis_status IN ('processing', 'ready', 'error'));

COMMENT ON COLUMN public.script_intelligence_cache.analysis_status IS
  'processing = IA ainda rodando | ready = resultado disponível | error = falha na análise';
