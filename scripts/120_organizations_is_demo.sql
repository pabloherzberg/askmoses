-- ============================================================
-- 120_organizations_is_demo.sql
--
-- Marca explícita de org de demonstração/teste.
--
-- MOTIVO: a sugestão semanal de script (Script Intelligence) escolhia as
-- calls de maior score da base inteira, e as 5 primeiras eram todas da
-- "AskMoses Demo Org" (calls fictícias, score 98–99). Não havia como
-- excluí-la de forma confiável:
--   - billing_status = 'DEMO' existe, mas o billing trata DEMO como org
--     pagante (isPaying em lib/db/billing.ts) e o valor é editado no diálogo
--     de cobrança por motivo financeiro — misturaria os dois assuntos;
--   - filtrar por nome é frágil.
--
-- Orgs com is_demo = true ficam fora de qualquer seleção de calls da
-- sugestão semanal e não recebem a sugestão.
--
-- Marcação por id (o nome é só trava contra id errado). Os ids de prod e de
-- dev são diferentes; no banco onde um id não existe, o UPDATE não faz nada.
--   prod: AskMoses Demo Org 67a11f99-…, VS Solutions 506b3eff-…
--   dev:  VS Solutions 7113479f-…  (dev não tem a AskMoses Demo Org)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS; o UPDATE pode repetir.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_demo IS
  'Org de demonstração ou teste interno. Fica fora das seleções de calls da '
  'sugestão semanal de script e não recebe a sugestão. Independe de '
  'billing_status (que é cobrança).';

UPDATE public.organizations
   SET is_demo = true
 WHERE (id = '67a11f99-2732-4d58-b454-505e3decf933' AND name = 'AskMoses Demo Org')
    OR (id = '506b3eff-f841-465f-a62f-d2f50f2d30eb' AND name = 'VS Solutions')
    OR (id = '7113479f-5c37-4eb4-b6d5-28d9b959f7dd' AND name = 'VS Solutions');

COMMIT;

-- Conferência (rodar depois do COMMIT):
--   SELECT id, name FROM public.organizations WHERE is_demo ORDER BY name;
--   prod: 2 linhas (AskMoses Demo Org, VS Solutions); dev: 1 (VS Solutions).

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS is_demo;
