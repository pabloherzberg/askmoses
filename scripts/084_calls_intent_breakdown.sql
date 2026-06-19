-- ============================================================
-- 084_calls_intent_breakdown.sql
--
-- Adiciona calls.intent_breakdown — objeto JSON com os 4 scores
-- de intent (financial, urgency, authority, engagement).
--
-- Estrutura: { "financial": 8, "urgency": 7, "authority": 6, "engagement": 5 }
-- Cada score é 0–10 (coerced no backend via clamp).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- NULL em calls anteriores a esta migration; derivado do intent (1–5)
-- via lib/utils/intent.ts · deriveIntentBreakdownForCall() quando precisado.
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS intent_breakdown JSONB;

COMMENT ON COLUMN public.calls.intent_breakdown IS
  'Buying intent breakdown (4 signals: financial, urgency, authority, engagement). '
  'Each score 0–10. NULL em calls pré-084. Computed during scoring via IA, '
  'respecting org-specific weights.';
