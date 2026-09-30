-- ============================================================
-- 121_script_suggestion_runs.sql
--
-- 1. Tabela script_suggestion_runs — uma linha por rodada do cron semanal
--    de sugestão de script (app/api/cron/weekly-script-suggestion).
-- 2. Coluna script_intelligence_cache.error_reason.
--
-- MOTIVO: hoje a rodada não deixa rastro no banco. Quais calls geraram o
-- script, quais orgs entraram ou ficaram de fora e por quê, e quanto custou
-- só aparecem no retorno HTTP do cron ou nos logs da Vercel. E quando a
-- análise por org falha, script_intelligence_cache fica com
-- analysis_status = 'error' e result = {} — o motivo só vai pro console.
--
-- ACESSO: RLS ligado e nenhuma policy — só service_role (o cron) lê e
-- escreve, como calls_data_corrections (116a).
--
-- Idempotente: IF NOT EXISTS; REVOKE/GRANT/COMMENT podem repetir.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.script_suggestion_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        timestamptz NOT NULL DEFAULT now(),
  -- sent:    script gerado e enviado;
  -- skipped: nenhuma org elegível — nada gerado nem enviado;
  -- error:   falha na seleção, na IA, na validação das 5 seções ou no envio.
  status        text NOT NULL CHECK (status IN ('sent', 'skipped', 'error')),
  -- [{ org_id, org_name, call_ids: [..3] }]
  included_orgs jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ org_id, org_name, eligible_calls, reason }]
  skipped_orgs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  call_ids      uuid[] NOT NULL DEFAULT '{}',
  script_id     uuid REFERENCES public.scripts(id) ON DELETE SET NULL,
  -- Orgs que receberam a pendente (não-demo).
  sent_to_count integer,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(12,6),
  error         text
);

CREATE INDEX IF NOT EXISTS idx_script_suggestion_runs_run_at
  ON public.script_suggestion_runs USING btree (run_at DESC);

ALTER TABLE public.script_suggestion_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.script_suggestion_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.script_suggestion_runs TO service_role;

COMMENT ON TABLE public.script_suggestion_runs IS
  'Uma linha por rodada da sugestão semanal de script: orgs incluídas e '
  'puladas (com motivo), calls usadas, script gerado, custo e erro.';

ALTER TABLE public.script_intelligence_cache
  ADD COLUMN IF NOT EXISTS error_reason text;

COMMENT ON COLUMN public.script_intelligence_cache.error_reason IS
  'Motivo quando analysis_status = ''error'' (ex.: sem calls com transcrição, '
  'IA falhou, JSON inválido, pendente órfã). NULL nos demais estados.';

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- ALTER TABLE public.script_intelligence_cache DROP COLUMN IF EXISTS error_reason;
-- DROP TABLE IF EXISTS public.script_suggestion_runs;
