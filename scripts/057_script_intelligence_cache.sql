-- ============================================================
-- 057_script_intelligence_cache.sql
-- Cache de resultado de Script Intelligence por org_script_id.
-- Guarda o resultado da IA + decisões do owner por sugestão.
-- Invalidado naturalmente quando o pending é resolvido (novo
-- orgScriptId = nova linha de cache).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.script_intelligence_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_script_id    UUID NOT NULL,                    -- FK lógica para org_scripts.id
  result           JSONB NOT NULL,                   -- ScriptIntelligenceResult completo
  decisions        JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de { index, decision, editedText }
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, org_script_id)
);

ALTER TABLE public.script_intelligence_cache ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (API routes usam admin client)
CREATE POLICY "sic_service_role" ON public.script_intelligence_cache
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Owner pode ler o cache da própria org via JWT
CREATE POLICY "sic_select_org" ON public.script_intelligence_cache
  FOR SELECT
  USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

-- TTL: expirar cache com mais de 30 dias (cleanup manual ou pg_cron futuro)
-- Por ora apenas um índice para queries rápidas
CREATE INDEX IF NOT EXISTS idx_sic_org_script ON public.script_intelligence_cache (org_id, org_script_id);
