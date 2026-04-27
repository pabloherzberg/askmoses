-- ============================================================
-- 018_create_plans_and_link_clients.sql
-- Plano vira entidade. Client recebe plan_id (FK plans) e
-- org_id (FK organizations 1:1). Organization recebe client_id
-- (FK reverso). Coluna text `clients.plan` é descartada.
-- ============================================================

-- ─── 1. Tabela plans ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE CHECK (code IN ('starter', 'pro', 'pro_rag')),
  name               TEXT NOT NULL,
  price_cents        INT NOT NULL DEFAULT 0,
  timeline_weeks     INT NOT NULL DEFAULT 0,
  has_rag            BOOLEAN NOT NULL DEFAULT false,
  has_twilio         BOOLEAN NOT NULL DEFAULT false,
  has_manual_upload  BOOLEAN NOT NULL DEFAULT true,
  max_sales_people   INT,
  features           JSONB DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_service_role_all" ON public.plans;
CREATE POLICY "plans_service_role_all" ON public.plans
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans
  FOR SELECT USING (true);

-- ─── 2. Seed dos 3 planos ────────────────────────────────────────────────────

INSERT INTO public.plans (id, code, name, price_cents, timeline_weeks, has_rag, has_twilio, has_manual_upload, max_sales_people, features)
VALUES
  (
    '00000000-0000-0000-0000-0000000000a1',
    'starter',
    'Starter',
    405000,
    2,
    false, false, true,
    4,
    '["Script & Rubric Manager","Manual call upload (audio or transcript)","AI analysis (Whisper + GPT-4o)","Post-call coaching email","Aggregated summary","History page"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    'pro',
    'Pro',
    810000,
    3,
    false, true, true,
    NULL,
    '["Everything in Starter","Twilio/GHL webhook integration","Automated call ingestion","Contact metadata sync","Zero manual upload"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-0000000000a3',
    'pro_rag',
    'Pro + RAG',
    1140700,
    4,
    true, true, true,
    NULL,
    '["Everything in Pro","RAG system (vector search)","Multi-document knowledge base","Context-aware coaching","Training material integration","Dynamic reference lookup"]'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name              = EXCLUDED.name,
  price_cents       = EXCLUDED.price_cents,
  timeline_weeks    = EXCLUDED.timeline_weeks,
  has_rag           = EXCLUDED.has_rag,
  has_twilio        = EXCLUDED.has_twilio,
  has_manual_upload = EXCLUDED.has_manual_upload,
  max_sales_people  = EXCLUDED.max_sales_people,
  features          = EXCLUDED.features;

-- ─── 3. Adicionar plan_id e org_id em clients ────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE RESTRICT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_plan_id_idx ON public.clients(plan_id);
CREATE INDEX IF NOT EXISTS clients_org_id_idx  ON public.clients(org_id);

-- ─── 4. Adicionar client_id em organizations (espelho 1:1) ───────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_client_id_idx ON public.organizations(client_id);

-- ─── 5. Backfill: mapear coluna text `plan` → plan_id ────────────────────────
-- Só executa se a coluna text `plan` ainda existir.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'plan'
  ) THEN
    UPDATE public.clients c
    SET plan_id = p.id
    FROM public.plans p
    WHERE c.plan_id IS NULL
      AND CASE
            WHEN c.plan = 'Starter' THEN p.code = 'starter'
            WHEN c.plan = 'Pro'     THEN p.code = 'pro'
            WHEN c.plan = 'Pro+RAG' THEN p.code = 'pro_rag'
            ELSE false
          END;
  END IF;
END;
$$;

-- ─── 6. Drop coluna text `plan` (após backfill validado) ─────────────────────

ALTER TABLE public.clients DROP COLUMN IF EXISTS plan;

-- ─── 7. Tornar plan_id obrigatório ───────────────────────────────────────────
-- Comentado por padrão: descomente após confirmar que todos os clients têm plan_id.
-- ALTER TABLE public.clients ALTER COLUMN plan_id SET NOT NULL;
