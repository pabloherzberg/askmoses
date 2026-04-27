-- ============================================================
-- 019_seed_three_clients.sql
-- Seed das 3 organizations × 3 clients × 3 planos.
--
-- Pré-requisitos:
--   - 012_create_organizations.sql aplicado (cria organizations,
--     habilita RLS por org_id em todas as tabelas)
--   - 013_seed_demo_org.sql aplicado (criou org `…000100` + tabelas
--     public.users, public.trainers, public.clients e a rubric demo)
--   - 018_create_plans_and_link_clients.sql aplicado (cria plans,
--     adiciona plan_id+org_id em clients e client_id em organizations)
--
-- O que este script faz:
--   1. Insere 2 novas orgs: K9 Elite Training (Pro+RAG) e Paw Academy (Starter)
--   2. UPSERT em clients (3 linhas), cada uma com plan_id e org_id
--      apontando para sua org tenant
--   3. Espelha organizations.client_id ← clients.id
--
-- Mapeamento autoritativo (alinhado com Supabase atual —
-- ver Downloads/{plans,clients,organizations}_rows.json):
--
--   org_id …000100  ↔  client …000801  →  Dog Wizard HQ      →  Pro      (a2)
--   org_id …000200  ↔  client …000803  →  K9 Elite Training  →  Pro+RAG  (a3)
--   org_id …000300  ↔  client …000802  →  Paw Academy        →  Starter  (a1)
--
-- Auth users, public.users (trainers/owner), trainers, calls e insights
-- dos novos tenants são criados pelo `setup-three-clients.mjs` para
-- garantir que public.users.id == auth.users.id (necessário para /api/me).
-- ============================================================


-- ─── 1. Criar 2 novas orgs ───────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, avg_ticket, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000200', 'K9 Elite Training', 1200, '2026-02-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000300', 'Paw Academy',       2200, '2025-11-20T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  avg_ticket = EXCLUDED.avg_ticket;


-- ─── 2. Inserir os 3 clients com plan_id + org_id ────────────────────────────

INSERT INTO public.clients (id, name, plan_id, org_id, calls_this_month, avg_score, mrr, health, trainers_count, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000801',
    'Dog Wizard HQ',
    (SELECT id FROM public.plans WHERE code = 'pro'),
    '00000000-0000-0000-0000-000000000100',
    20, 83, 1500, 'healthy', 4,
    '2026-01-15T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    'Paw Academy',
    (SELECT id FROM public.plans WHERE code = 'starter'),
    '00000000-0000-0000-0000-000000000300',
    8, 71, 500, 'at-risk', 4,
    '2026-02-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000803',
    'K9 Elite Training',
    (SELECT id FROM public.plans WHERE code = 'pro_rag'),
    '00000000-0000-0000-0000-000000000200',
    35, 88, 2500, 'healthy', 4,
    '2025-11-20T00:00:00Z'
  )
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  plan_id          = EXCLUDED.plan_id,
  org_id           = EXCLUDED.org_id,
  calls_this_month = EXCLUDED.calls_this_month,
  avg_score        = EXCLUDED.avg_score,
  mrr              = EXCLUDED.mrr,
  health           = EXCLUDED.health,
  trainers_count   = EXCLUDED.trainers_count;


-- ─── 3. Espelhar organizations.client_id ←  clients.id ───────────────────────

UPDATE public.organizations o
SET client_id = c.id
FROM public.clients c
WHERE c.org_id = o.id
  AND (o.client_id IS NULL OR o.client_id <> c.id);


-- ─── 4. Garantir que rubrics/criteria/calls antigos do org …100 ainda batem ──
-- (o seed 013 já vinculou tudo ao org …100; só re-confirmamos por segurança)

UPDATE public.rubrics  SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.criteria SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.calls    SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.scripts  SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
