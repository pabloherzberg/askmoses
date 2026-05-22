-- ============================================================
-- 062_fix_deprecated_scope.sql
--
-- Corrige a view org_scripts_current: o status 'deprecated' estava sendo
-- derivado comparando contra TODOS os scripts do catálogo (s2 em public.scripts),
-- mesmo que esse script mais novo nunca tivesse sido enviado para a org.
--
-- Resultado do bug: owner aceita v2.1, mas v2.2 existe no catálogo geral →
-- effective_status volta 'deprecated' imediatamente, mesmo que v2.2 ainda
-- não tenha sido enviada para essa org.
--
-- Fix: o EXISTS agora filtra por org_scripts (scripts enviados para a org),
-- não pela tabela global scripts. Um script só depreca o anterior se ele
-- foi efetivamente enviado para aquela mesma org (org_id = os.org_id).
--
-- Idempotente (CREATE OR REPLACE). Rode após 061.
-- ============================================================

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  -- Status efetivo: 'active' vira 'deprecated' apenas se ESSA ORG tem
  -- outro script (org_scripts) com versão maior na mesma rubric_id e
  -- ainda aberto (ended_at IS NULL). Compara dentro do contexto da org,
  -- não contra o catálogo global.
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1
        FROM public.org_scripts os2
        JOIN public.scripts s2 ON s2.id = os2.script_id
       WHERE os2.org_id = os.org_id
         AND s2.rubric_id = s.rubric_id
         AND os2.ended_at IS NULL
         AND os2.id <> os.id
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado). '
  'A partir da migration 062, deprecated só é calculado contra scripts enviados '
  'para a mesma org — não contra o catálogo global.';
