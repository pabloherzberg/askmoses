-- ============================================================
-- 085_org_intent_weight_history.sql
--
-- Cria tabela org_intent_weight_history para auditar mudanças
-- de pesos de intent por organização.
--
-- Cada vez que os pesos são alterados, registra:
-- - org_id
-- - old_weights (antes da mudança)
-- - new_weights (depois da mudança)
-- - changed_by (quem alterou)
-- - changed_at (quando)
-- - reason (opcional)
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_intent_weight_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  old_weights JSONB,
  new_weights JSONB NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT now(),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_intent_weight_history_org_id_idx
  ON public.org_intent_weight_history(org_id);

CREATE INDEX IF NOT EXISTS org_intent_weight_history_changed_at_idx
  ON public.org_intent_weight_history(changed_at DESC);

COMMENT ON TABLE public.org_intent_weight_history IS
  'Audit trail para mudanças de pesos de intent por org. '
  'Registra old_weights, new_weights, quem mudou e quando.';

COMMENT ON COLUMN public.org_intent_weight_history.old_weights IS
  'Pesos anteriores: {financial: 4, urgency: 3, authority: 2, engagement: 1}';

COMMENT ON COLUMN public.org_intent_weight_history.new_weights IS
  'Pesos novos: {financial: 5, urgency: 3, authority: 1, engagement: 1}';

COMMENT ON COLUMN public.org_intent_weight_history.reason IS
  'Motivo da mudança (opcional): "Ajuste por feedback", "Teste A/B", etc.';
