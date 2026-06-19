-- ============================================================
-- 089_llm_usage_events.sql
--
-- Tabela CENTRAL de telemetria de custo de LLM. Cada chamada de LLM do
-- backend grava UMA linha aqui (via lib/services/llm-usage.ts). É a fonte
-- única do COGS real da tela de Billing (admin):
--
--   COGS = SUM(cost_usd) por org + janela     (admin only)
--
-- Substitui o chute antigo `cogs = amountDue × 0.30` (COGS_FRACTION) em
-- lib/db/billing.ts. Cada org passa a ter o custo REAL de todas as suas
-- chamadas de LLM (analyze, transcription, diarization, marketing, insights,
-- coaching, scripts...), não uma fração estimada do faturado.
--
-- Por que tabela única (e não somar colunas espalhadas):
--   - Hoje só 3 surfaces gravam custo (calls.cost_usd,
--     call_chunks.transcription_cost_usd, marketing_runs.cost_usd) e 7+ não
--     gravam nada. Centralizar = COGS completo + auditável por surface/modelo.
--   - Dual-write: as colunas atuais FICAM como estão; esta tabela é aditiva.
--
-- cost_usd é gravado no momento da chamada (preço de llm_pricing daquele
-- instante) → mudar preço depois não reescreve custo histórico.
--
-- org_id é NULLABLE de propósito: alguns surfaces não têm org atribuível
-- (translation i18n genérica). Eventos sem org ficam FORA do COGS por-org,
-- mas o custo continua registrado para visibilidade do gasto global.
--
-- RLS: mesmo padrão de call_chunks (077) — service_role faz tudo (o recorder
-- roda server-side com admin client), org só lê os próprios via JWT.
--
-- Idempotente. Rode após 088.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.llm_usage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  surface       TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'openai',
  model         TEXT NOT NULL,
  input_tokens  INT,
  output_tokens INT,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  call_id       UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  ref           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. CHECK de surface (idempotente) ──────────────────────────────────────

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
      'coaching', 'translation', 'script_generation', 'script_improve',
      'script_gap', 'script_intelligence'
    ));
END$$;

-- ─── 3. Índices ──────────────────────────────────────────────────────────────

-- O índice do COGS: soma cost_usd por org numa janela de created_at.
CREATE INDEX IF NOT EXISTS llm_usage_events_org_created_idx
  ON public.llm_usage_events(org_id, created_at DESC);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
-- Mesmo padrão de call_chunks (077): service_role faz tudo (recorder usa admin
-- client), org só lê os próprios via JWT.

ALTER TABLE public.llm_usage_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'llm_usage_events'
      AND policyname = 'llm_usage_events_service_role'
  ) THEN
    CREATE POLICY "llm_usage_events_service_role" ON public.llm_usage_events
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'llm_usage_events'
      AND policyname = 'llm_usage_events_select_org'
  ) THEN
    CREATE POLICY "llm_usage_events_select_org" ON public.llm_usage_events
      FOR SELECT
      USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
  END IF;
END$$;

COMMENT ON TABLE public.llm_usage_events IS
  'Telemetria central de custo de LLM. 1 linha por chamada (lib/services/llm-usage.ts). '
  'Fonte do COGS real da Billing admin (SUM(cost_usd) por org+janela). org_id nullable: '
  'surfaces sem org (translation) ficam fora do COGS por-org.';

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.llm_usage_events;
