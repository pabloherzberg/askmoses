-- ============================================================
-- 029_plan_limits.sql
-- Limites por plano (TC-10/TC-11). Adiciona max_calls_per_month
-- e atualiza max_sales_people nos 3 plans existentes:
--
--   starter : 5  seats / 200  calls/mês
--   pro     : 15 seats / 1000 calls/mês
--   pro_rag : NULL (ilimitado em ambos)
--
-- Convenção: NULL = ilimitado (consistente com max_sales_people
-- que já era NULL pra pro/pro_rag em 018). Gates de seats/calls
-- na app tratam NULL como bypass.
--
-- has_rag NÃO mexe — pro_rag já é true (018), starter/pro são
-- false. Confirmado pelo PO em 2026-05-05.
-- ============================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_calls_per_month INT;

COMMENT ON COLUMN public.plans.max_calls_per_month IS
  'Máximo de calls criadas por mês corrente para uma org neste plano. NULL = ilimitado.';

-- ─── Atualização dos 3 plans ─────────────────────────────────────────────────
-- ON CONFLICT em code garante que só atualiza linhas existentes (não cria).

UPDATE public.plans SET max_sales_people = 5,    max_calls_per_month = 200  WHERE code = 'starter';
UPDATE public.plans SET max_sales_people = 15,   max_calls_per_month = 1000 WHERE code = 'pro';
UPDATE public.plans SET max_sales_people = NULL, max_calls_per_month = NULL WHERE code = 'pro_rag';
