-- ============================================================
-- 044_script_versioning_and_org_scripts.sql
--
-- Adiciona versionamento a scripts/rubrics e cria a tabela
-- org_scripts pra associar scripts a organizações com status.
--
-- Modelo:
--   - Rubric = "major version" (ex: 1, 2, 3) — mudança grande de critérios
--   - Script = "minor version" dentro de uma rubric (ex: 1.0, 1.1, 1.2,
--     2.0) — refinamento sobre a mesma rubric base
--
-- Quando Admin cria/atualiza um script:
--   - rubric_version_snapshot = current rubrics.version (capturado no
--     momento da criação pra preservar histórico mesmo se a rubric mudar)
--   - script_minor_version = (próxima minor disponível pra essa rubric)
--
-- org_scripts vincula org × script com status:
--   - 'pending'    → Admin enviou, Owner ainda não aceitou
--   - 'active'     → Owner aceitou e está usando
--   - 'rejected'   → Owner recusou
--   Status 'deprecated' NÃO é armazenado — é derivado em SELECT:
--     status='active' AND existe script newer com mesma rubric_id.
--   Decisão: read-time computation evita triggers/jobs pra marcar
--   deprecated automaticamente quando um script novo entra. Custo: 1
--   subquery por linha no listing do Admin (~poucas dezenas de orgs).
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Versioning columns ──────────────────────────────────────────────

ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS rubric_version_snapshot INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS minor_version           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_template             BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.rubrics.version IS
  'Major version da rubric. Bump manual quando os critérios mudam estruturalmente.';
COMMENT ON COLUMN public.scripts.rubric_version_snapshot IS
  'Snapshot da rubrics.version no momento da criação deste script.';
COMMENT ON COLUMN public.scripts.minor_version IS
  'Minor version dentro do (rubric_id, rubric_version_snapshot). Auto-incrementado.';
COMMENT ON COLUMN public.scripts.is_template IS
  'TRUE = catálogo global que o Admin pode enviar pra orgs. FALSE = script local de uma org.';

-- Backfill: todo script existente vira 1.0 (rubric=1, minor=0) — coerente
-- com o default da rubrics.version=1.
UPDATE public.scripts
   SET rubric_version_snapshot = 1, minor_version = 0
 WHERE rubric_version_snapshot IS NULL OR minor_version IS NULL;

-- ─── 2. org_scripts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_scripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  script_id   UUID NOT NULL REFERENCES public.scripts(id)       ON DELETE CASCADE,
  -- Status armazenado. 'deprecated' é derivado em read time (ver view abaixo).
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'active', 'rejected')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  sent_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma org não pode ter o mesmo script associado duas vezes — se quiser
  -- "re-enviar" o mesmo script, basta dar UPDATE no status.
  UNIQUE (org_id, script_id)
);

CREATE INDEX IF NOT EXISTS idx_org_scripts_org_id    ON public.org_scripts(org_id);
CREATE INDEX IF NOT EXISTS idx_org_scripts_script_id ON public.org_scripts(script_id);
CREATE INDEX IF NOT EXISTS idx_org_scripts_status    ON public.org_scripts(status);

-- Habilita RLS — leitura/escrita só via service role (Admin endpoints).
-- Owners/Trainers leem indiretamente pelos endpoints que já usam
-- createAdminClient nesse projeto. Sem policy explícita = bloqueado pra
-- anon/auth keys.
ALTER TABLE public.org_scripts ENABLE ROW LEVEL SECURITY;

-- ─── 3. Trigger pra atualizar updated_at ────────────────────────────────

CREATE OR REPLACE FUNCTION public.org_scripts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_scripts_updated_at ON public.org_scripts;
CREATE TRIGGER trg_org_scripts_updated_at
  BEFORE UPDATE ON public.org_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.org_scripts_touch_updated_at();

-- ─── 4. Seed: 3 templates de catálogo pra demonstração ──────────────────

-- Usa a rubric default (00000000-0000-0000-0000-000000000001) seedada
-- na migration 001. ON CONFLICT DO NOTHING permite re-rodar.

INSERT INTO public.scripts
  (id, rubric_id, name, description, sections, is_active, is_template,
   rubric_version_snapshot, minor_version)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v1.0',
    'Catálogo template — versão inicial do script de vendas.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    1, 0
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v1.2',
    'Catálogo template — refinamento de discovery e objection handling.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    1, 2
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v2.0',
    'Catálogo template — major refresh com nova rubric.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    2, 0
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 5. View pra leitura: org_scripts_current ───────────────────────────
-- Materializa o status efetivo (incluindo 'deprecated' derivado) pra
-- consumidores que querem o estado real-time sem repetir a lógica.

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
  -- Status efetivo: 'active' vira 'deprecated' se existir script newer
  -- na mesma rubric_id (major maior, ou mesmo major + minor maior).
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1 FROM public.scripts s2
       WHERE s2.rubric_id = s.rubric_id
         AND s2.is_template = TRUE
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
