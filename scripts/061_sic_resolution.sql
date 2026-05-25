-- ============================================================
-- 061_sic_resolution.sql
-- Adiciona coluna resolution à tabela script_intelligence_cache.
-- Persiste a decisão global do owner (accepted/rejected) para
-- que após refresh a tela continue mostrando o estado correto.
-- ============================================================

ALTER TABLE public.script_intelligence_cache
  ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT NULL
    CHECK (resolution IN ('accepted', 'rejected'));

COMMENT ON COLUMN public.script_intelligence_cache.resolution IS
  'accepted = owner aprovou o script | rejected = owner recusou | null = ainda pendente';
