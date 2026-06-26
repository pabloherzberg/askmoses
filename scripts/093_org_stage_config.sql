-- ============================================================
-- 093_org_stage_config.sql
--
-- Configuração POR ORG do que conta como SUCESSO em cada estágio do funil.
-- O Ariel reforçou: "o sistema sempre precisa saber o que é sucesso no stage 1
-- e no stage 2, configurável por org".
--
--   stage1_success_outcomes — quais call_outcome contam como sucesso no Stage 1
--                             (agendar o intro offer). Default ['closed'].
--                             Array porque uma org pode considerar
--                             ['closed','partial'] como "agendou".
--   stage2_success_label    — rótulo/definição do que é paying client no Stage 2
--                             para a org (ex.: "Pagou o pacote mensal").
--
-- Mesma filosofia do rubrics.outcome_options (TEXT[]). Leitura unificada via
-- lib/services/stage-config.ts (getStageSuccessConfig).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, defaults aplicados a linhas novas.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stage1_success_outcomes TEXT[] NOT NULL DEFAULT ARRAY['closed']::text[];

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stage2_success_label TEXT;

COMMENT ON COLUMN public.organizations.stage1_success_outcomes IS
  'Stage 1 (Initial Result): quais call_outcome contam como sucesso (agendou o '
  'intro offer). Default ["closed"]. Configurável por org.';

COMMENT ON COLUMN public.organizations.stage2_success_label IS
  'Stage 2 (Actual Close): definição do que é paying client para a org '
  '(ex.: "Pagou o pacote"). Texto livre, configurável por org.';

COMMIT;
