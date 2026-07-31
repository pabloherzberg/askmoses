-- ============================================================
-- 106_org_billing_status_default_paid.sql
--
-- Troca o DEFAULT de organizations.billing_status de 'PILOT' para 'PAID'.
--
-- Contexto: a 082 criou a coluna com DEFAULT 'PILOT' partindo da premissa de
-- que toda org nova entrava como piloto grátis e alguém a promoveria depois.
-- Só que nunca existiu caminho de escrita — nenhuma rota, tela ou trigger
-- alterava billing_status — então org nenhuma saía de PILOT, e o admin via
-- receita R$ 0 numa org que consumia minutos e gerava custo de LLM.
--
-- Decisão: o caso comum é org pagante. PILOT/DEMO/DISABLED passam a ser a
-- exceção, setada explicitamente pelo Admin em /admin/billing (o dialog da
-- BillingTable agora escreve nesta coluna via
-- PATCH /api/admin/organizations/[id]/billing-rate).
--
-- NÃO faz backfill: orgs existentes mantêm o status atual. Quem hoje está em
-- PILOT continua em PILOT — mudar isso em massa começaria a faturar clientes
-- retroativamente, o que é decisão comercial, não de migration. O Admin
-- promove uma a uma pela tela.
--
-- Idempotente. Rode após 105.
-- ============================================================

ALTER TABLE public.organizations
  ALTER COLUMN billing_status SET DEFAULT 'PAID';

COMMENT ON COLUMN public.organizations.billing_status IS
  'Status de cobrança da org (badge da tela de Billing). Independe de '
  'subscription_status. PAID=cobrada (DEFAULT desde a 106); PILOT=piloto '
  'grátis; DEMO=org de demonstração; DISABLED=cobrança suspensa. Editável '
  'pelo Admin em /admin/billing.';

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
--   ALTER TABLE public.organizations ALTER COLUMN billing_status SET DEFAULT 'PILOT';
