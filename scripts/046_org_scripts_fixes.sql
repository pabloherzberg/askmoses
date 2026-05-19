-- ============================================================
-- 046_org_scripts_fixes.sql
--
-- Corrige 3 issues identificados no code review da PR ADMIN-SAASPANEL:
--
--   1. View org_scripts_current: a EXISTS filtrava por
--      s2.is_template = TRUE, mas o catalog endpoint passou a aceitar
--      QUALQUER script (incluindo is_template=false). Resultado: scripts
--      não-template nunca marcam versões anteriores como 'deprecated'.
--      Fix: remover o filtro de is_template do EXISTS.
--
--   2. Race condition em /api/admin/scripts/send: dois admins enviando
--      concorrentemente pra mesma org podiam criar múltiplas linhas com
--      ended_at IS NULL — quebra o invariante "1 script corrente por org".
--      Fix: partial unique index (org_id) WHERE ended_at IS NULL força
--      a constraint no DB. Concurrent writes batem em 409, app retry.
--
--   3. dbGetClients estava baixando a tabela calls inteira pra computar
--      MAX(created_at) por org_id no JS. Não escala. Fix: RPC SQL que
--      faz o GROUP BY no banco.
--
-- Idempotente. Rode após 044 e 045.
-- ============================================================

-- ─── 1. Recria view sem o filtro is_template ────────────────────────────

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
  -- Status efetivo: 'active' vira 'deprecated' se existir QUALQUER script
  -- (template ou não) com versão maior na mesma rubric_id. is_template
  -- ficou como flag deprecated no schema — UI não filtra mais por isso.
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1 FROM public.scripts s2
       WHERE s2.rubric_id = s.rubric_id
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
  'Read-side da relação org × script com effective_status (deprecated derivado).';

-- ─── 2. Partial unique index pra race condition ─────────────────────────
-- Garante que cada org tem no máximo 1 row "aberta" (ended_at IS NULL)
-- por vez. Concurrent sends pra mesma org batem em 23505 (unique violation)
-- — caller (POST /scripts/send) deve traduzir pra erro de UX legível.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL;

-- ─── 3. RPC pra MAX(calls.created_at) por org ───────────────────────────
-- Substitui o SELECT * FROM calls + agrupamento em JS. Agora o GROUP BY
-- roda no PG; só (org_id, max_created_at) trafega na wire.
--
-- STABLE = sem side effects, pode ser cacheado dentro da transação.
-- SECURITY DEFINER não é necessário — service_role já bypass RLS.

CREATE OR REPLACE FUNCTION public.get_last_call_per_org()
RETURNS TABLE(org_id UUID, last_call_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.org_id,
    MAX(c.created_at) AS last_call_at
  FROM public.calls c
  WHERE c.org_id IS NOT NULL
  GROUP BY c.org_id;
$$;

COMMENT ON FUNCTION public.get_last_call_per_org() IS
  'Retorna (org_id, max_created_at) agregado por org. Usado pelo painel admin pra coluna Last Activity.';

-- Grant execute pro service_role (anon/auth não devem chamar diretamente).
GRANT EXECUTE ON FUNCTION public.get_last_call_per_org() TO service_role;
