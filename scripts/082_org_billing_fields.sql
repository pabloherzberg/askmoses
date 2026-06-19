-- ============================================================
-- 082_org_billing_fields.sql
--
-- Suporta a feature de Billing (telas Owner + Admin) ligando o front no
-- Supabase real (substitui os mocks MSW de billing).
--
-- Adiciona DUAS colunas em organizations:
--
--   1. rate_per_minute_micros INT — tarifa de cobrança por minuto, em
--      MICRO-USD (1 USD = 1.000.000 micros). Default 66700 (= US$0,0667/min,
--      ≈ $1 por call de 15 min). Agora AJUSTÁVEL POR ORG (negociação): o TS
--      passa a ler esta coluna em vez da constante global. Em micros (INT) pra
--      representar exato o $0,0667 (não cabe em centavos inteiros) e evitar
--      imprecisão de float em dinheiro.
--
--   2. billing_status TEXT — status de cobrança exibido como badge na tela
--      (PAID | PILOT | DEMO | DISABLED). É independente do subscription_status
--      (active/inactive/trial): subscription_status governa acesso ao produto;
--      billing_status governa se/como a org é cobrada. Backfill inicial deriva
--      de subscription_status, mas o Admin pode sobrescrever depois.
--
-- NÃO toca em calls nem cria tabela de histórico — o consumo continua agregado
-- dinamicamente de calls.duration_seconds / calls.created_at (modelo da 071).
-- LLM cost / COGS NÃO são persistidos: são derivados em TS (% do faturado).
--
-- Idempotente. Rode após 081.
-- ============================================================

-- ─── 1. rate_per_minute_micros (default US$0,0667/min) ──────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rate_per_minute_micros INT NOT NULL DEFAULT 66700;

COMMENT ON COLUMN public.organizations.rate_per_minute_micros IS
  'Tarifa de cobrança por minuto em micro-USD (1 USD = 1e6 micros). Default '
  '66700 = $0,0667/min (≈ $1 por call de 15 min). Ajustável por org. Lida por '
  'lib/db/billing.ts para fins da feature de Billing.';

-- ─── 2. billing_status (PAID | PILOT | DEMO | DISABLED) ─────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'PILOT';

-- Constraint idempotente.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_status_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_billing_status_check
  CHECK (billing_status IN ('PAID', 'PILOT', 'DEMO', 'DISABLED'));

COMMENT ON COLUMN public.organizations.billing_status IS
  'Status de cobrança da org (badge da tela de Billing). Independe de '
  'subscription_status. PAID=cobrada; PILOT=piloto grátis; DEMO=org de '
  'demonstração; DISABLED=cobrança suspensa.';

-- ─── 3. Backfill billing_status a partir de subscription_status ─────────────
-- Só linhas que ainda estão no default 'PILOT' (não sobrescreve ajuste manual
-- já feito pelo Admin). active → PAID, inactive → DISABLED, trial → PILOT.

UPDATE public.organizations
SET billing_status = CASE subscription_status
  WHEN 'active'   THEN 'PAID'
  WHEN 'inactive' THEN 'DISABLED'
  ELSE 'PILOT'
END
WHERE billing_status = 'PILOT';

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
--   ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_billing_status_check;
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS billing_status;
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS rate_per_minute_micros;
