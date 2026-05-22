-- ============================================================
-- RODAR NO SUPABASE DASHBOARD → SQL EDITOR
-- Inclui migrations 057, 058 e 059
-- ============================================================

-- === 057: Criar tabela script_intelligence_cache ===

CREATE TABLE IF NOT EXISTS public.script_intelligence_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_script_id    UUID NOT NULL,
  result           JSONB NOT NULL DEFAULT '{}'::jsonb,
  decisions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_status  TEXT NOT NULL DEFAULT 'ready'
                     CHECK (analysis_status IN ('processing', 'ready', 'error')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, org_script_id)
);

ALTER TABLE public.script_intelligence_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'script_intelligence_cache' AND policyname = 'sic_service_role'
  ) THEN
    CREATE POLICY "sic_service_role" ON public.script_intelligence_cache
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'script_intelligence_cache' AND policyname = 'sic_select_org'
  ) THEN
    CREATE POLICY "sic_select_org" ON public.script_intelligence_cache
      FOR SELECT
      USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sic_org_script
  ON public.script_intelligence_cache (org_id, org_script_id);

-- === 058 + 059: Corrigir RPC send_script_to_orgs (previous_script_id fallback) ===

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  out_id          UUID,
  out_org_id      UUID,
  out_script_id   UUID,
  out_status      TEXT,
  out_started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do script ativo antes do close.
  -- P1: linha active em org_scripts. P2: scripts.is_active=true (fallback).
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (combined.target_org_id)
      combined.target_org_id,
      combined.prev_script_id,
      combined.priority
    FROM (
      SELECT os.org_id AS target_org_id, os.script_id AS prev_script_id, 1 AS priority
      FROM public.org_scripts os
      WHERE os.org_id = ANY(p_org_ids) AND os.status = 'active' AND os.ended_at IS NULL
      UNION ALL
      SELECT s.org_id AS target_org_id, s.id AS prev_script_id, 2 AS priority
      FROM public.scripts s
      WHERE s.org_id = ANY(p_org_ids) AND s.is_active = true
    ) combined
    ORDER BY combined.target_org_id, combined.priority ASC;

  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status             = 'pending',
        started_at         = v_now,
        ended_at           = NULL,
        sent_by            = p_sent_by,
        previous_script_id = EXCLUDED.previous_script_id
  RETURNING
    tgt.id         AS out_id,
    tgt.org_id     AS out_org_id,
    tgt.script_id  AS out_script_id,
    tgt.status     AS out_status,
    tgt.started_at AS out_started_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- === Corrigir estado atual do banco ===
-- Garantir que Dog Wizard HQ tem linha ativa em org_scripts apontando para o script correto

UPDATE public.org_scripts
   SET status = 'active', ended_at = NULL
 WHERE org_id = '00000000-0000-0000-0000-000000000100'
   AND script_id = '00000000-0000-0000-0000-0000000005a1'
   AND ended_at IS NOT NULL;

-- Fechar qualquer pending aberto (para limpar o estado)
UPDATE public.org_scripts
   SET status = 'rejected', ended_at = now()
 WHERE org_id = '00000000-0000-0000-0000-000000000100'
   AND status = 'pending'
   AND ended_at IS NULL;

-- Reativar o script ativo
UPDATE public.org_scripts
   SET status = 'active', ended_at = NULL
 WHERE org_id = '00000000-0000-0000-0000-000000000100'
   AND script_id = '00000000-0000-0000-0000-0000000005a1';
