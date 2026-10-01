-- ============================================================
-- 125_ghl_won_por_lead.sql
--
-- O Won passa a ser do LEAD (org_id, contact_id), não da call.
--
-- POR QUE: o cron sync-ghl-opportunities baixava todas as opportunities
-- won/lost da location, todo dia, e reprocessava cada uma. Em 30/09 e 01/10/2026
-- terminou em 504 aos 300s, e 7 orgs (K9 Activity Club, Centurion K9, …) ficaram
-- sem Won novo desde 25/09. Além disso o cron gravava won e depois lost por
-- contact_id, então um lead com uma opportunity won e outra lost ficava 'lost'.
--
-- REGRAS
--   1. Lead é Won se tiver QUALQUER opportunity won no GHL, de qualquer pipeline.
--      Won é definitivo: o sync nunca rebaixa. Opportunity reaberta, excluída ou
--      de contato mesclado mantém o lead won; o que o GHL disse fica em
--      ghl_leads.ghl_status / ghl_divergence, só para diagnóstico.
--      won_at = lastStatusChangeAt da opportunity won mais recente.
--   2. Won Rate: lead fechado só conta como Won se won_at for POSTERIOR à
--      primeira call fechada dele (org_won_rate e stamp_call_stats_weekly).
--   3. Stage 2 automático: a call de venda (is_sales_call IS DISTINCT FROM false)
--      mais recente ANTERIOR ao Won. Sem call de venda antes do Won, sem Stage 2.
--   4. Calls recusadas pelo webhook (lead já Won) passam a ser gravadas em
--      ghl_rejected_calls, para termos contagem.
--
-- MOMENTO DA CALL: call_date (início do dia, UTC) quando existe; senão
-- created_at. Em prod (01/10/2026) call_date é nulo em 2.474 das 2.480 calls.
--
-- AS CALLS HERDAM o status do lead: apply_ghl_lead_status grava ghl_leads e
-- copia ghl_won_status / ghl_won_at / ghl_opportunity_id para todas as calls do
-- contato, na mesma transação. Os leitores de hoje (webhook 5d, telas, Won Rate)
-- continuam lendo de calls.
--
-- FUNÇÕES REESCRITAS a partir de pg_get_functiondef de PROD em 01/10/2026
-- (regra do SCHEMA.md — nunca do arquivo de uma migration antiga):
--   org_won_rate              (md5 075453ab…; igual no dev)
--   mark_stage2_paying_from_won (md5 67c32db3…; igual no dev)
--   stamp_call_stats_weekly   (md5 2c5586a2… em prod). O dev está SEM o filtro
--     de scoring_status que prod tem; aplicar este arquivo no dev alinha os dois.
--
-- mark_stage2_paying_from_won ganha um 3º parâmetro (p_applied_by, default
-- 'ghl_won_sync'). A versão de 2 parâmetros é removida antes, senão a chamada
-- com 2 argumentos ficaria ambígua. O código antigo (.rpc com p_org_id e
-- p_contact_id) continua funcionando pelo default.
--
-- DEPENDE DE: 107 (org_won_rate, call_stats_weekly, job_watermarks),
-- 116a (calls_data_corrections), 117.
--
-- DEPLOY: 125 no dev → 125 em prod → código. O backfill
-- (scripts/backfill-ghl-won-por-lead.mts) roda depois, com prévia aprovada.
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS.
-- ============================================================

BEGIN;

-- ── Momento da call ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.call_moment(p_call_date date, p_created_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_call_date::timestamp AT TIME ZONE 'UTC', p_created_at)
$$;

COMMENT ON FUNCTION public.call_moment(date, timestamptz) IS
  'Momento da call para regras de data do Won: call_date (00:00 UTC) se houver, senão created_at.';

-- ── Status do lead ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_leads (
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id         text        NOT NULL,
  status             text        NOT NULL CHECK (status IN ('won', 'lost', 'open', 'abandoned', 'none')),
  won_at             timestamptz,
  won_opportunity_id text,
  won_pipeline_id    text,
  won_stage_id       text,
  -- O que o GHL respondeu na última consulta, mesmo quando o lead continua won
  -- por ser definitivo. Diagnóstico; nada lê para decidir.
  ghl_status         text,
  ghl_divergence     text,
  checked_at         timestamptz,
  source             text        NOT NULL CHECK (source IN ('webhook', 'sync', 'backfill')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ghl_leads_revisit
  ON public.ghl_leads (org_id, checked_at NULLS FIRST)
  WHERE status <> 'won';

ALTER TABLE public.ghl_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ghl_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghl_leads TO service_role;

COMMENT ON TABLE public.ghl_leads IS
  'Status do lead no GHL por (org_id, contact_id). Won é definitivo. As calls herdam ghl_won_status/ghl_won_at via apply_ghl_lead_status. Só service_role.';

-- ── Calls recusadas pelo webhook ────────────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_rejected_calls (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id       text,
  external_call_id text        NOT NULL,
  reason           text        NOT NULL,
  rejected_at      timestamptz NOT NULL DEFAULT now(),
  -- O GHL reenvia o webhook; a mesma call recusada duas vezes conta uma.
  UNIQUE (org_id, external_call_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_ghl_rejected_calls_org_date
  ON public.ghl_rejected_calls (org_id, rejected_at DESC);

ALTER TABLE public.ghl_rejected_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ghl_rejected_calls FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ghl_rejected_calls TO service_role;

COMMENT ON TABLE public.ghl_rejected_calls IS
  'Calls que o webhook do GHL recusou sem criar linha em calls (ex.: contact_already_won). Só contagem/diagnóstico.';

-- ── Stage 2 a partir do Won ─────────────────────────────────
DROP FUNCTION IF EXISTS public.mark_stage2_paying_from_won(uuid, text);

CREATE OR REPLACE FUNCTION public.mark_stage2_paying_from_won(
  p_org_id     uuid,
  p_contact_id text,
  p_applied_by text DEFAULT 'ghl_won_sync'
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ganho AS (
    -- Data do Won: a do lead; para lead ainda sem linha em ghl_leads, a das calls.
    SELECT COALESCE(
             (SELECT l.won_at FROM public.ghl_leads l
              WHERE  l.org_id = p_org_id AND l.contact_id = p_contact_id AND l.status = 'won'),
             (SELECT max(c.ghl_won_at) FROM public.calls c
              WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id AND c.ghl_won_status = 'won')
           ) AS won_at
  ),
  alvo AS (
    -- Call de venda mais recente ANTERIOR ao Won. Sem ela, não há alvo.
    SELECT c.id, g.won_at
    FROM   public.calls c
    CROSS  JOIN ganho g
    WHERE  c.org_id = p_org_id
      AND  c.contact_id = p_contact_id
      AND  c.is_sales_call IS DISTINCT FROM false
      AND  g.won_at IS NOT NULL
      AND  public.call_moment(c.call_date, c.created_at) < g.won_at
    ORDER  BY public.call_moment(c.call_date, c.created_at) DESC,
              c.created_at DESC
    LIMIT  1
  ),
  marcada AS (
    UPDATE public.calls c
    SET    stage2_outcome   = 'paying',
           became_paying_at = alvo.won_at
    FROM   alvo
    WHERE  c.id = alvo.id
      AND  c.stage2_outcome IS NULL
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.calls p
             WHERE  p.org_id = p_org_id
               AND  p.contact_id = p_contact_id
               AND  p.stage2_outcome = 'paying'
           )
    RETURNING c.id, c.became_paying_at
  ),
  trilha AS (
    INSERT INTO public.calls_data_corrections
      (call_id, column_name, old_value, new_value, applied_by, reason)
    SELECT m.id, v.column_name, 'null'::jsonb, v.new_value, p_applied_by,
           'GHL Won → Stage 2 paying na call de venda anterior ao Won (mark_stage2_paying_from_won, 125)'
    FROM   marcada m
    CROSS  JOIN LATERAL (VALUES
             ('stage2_outcome',   to_jsonb('paying'::text)),
             ('became_paying_at', to_jsonb(m.became_paying_at))
           ) AS v(column_name, new_value)
    RETURNING 1
  )
  SELECT id FROM marcada;
$$;

REVOKE ALL ON FUNCTION public.mark_stage2_paying_from_won(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stage2_paying_from_won(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.mark_stage2_paying_from_won(uuid, text, text) IS
  'GHL Won → Stage 2 paying na call de venda mais recente ANTERIOR ao Won. Sem ela, nada. Só se stage2_outcome IS NULL e nenhuma call do contato já for paying. Trilha em calls_data_corrections.';

-- Revisão do Stage 2 automático de UM lead pela regra 3 — usada pelo backfill.
-- Desfaz 'paying' automático (trilha de ghl_won_sync ou da 118) que não está na
-- call certa, depois marca a call certa. Um 'paying' sem trilha automática é
-- manual: o lead inteiro fica intocado. Trilha ANTES de cada UPDATE.
CREATE OR REPLACE FUNCTION public.reconcile_stage2_from_won(
  p_org_id     uuid,
  p_contact_id text,
  p_applied_by text
)
RETURNS TABLE (removed integer, marked uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_won_at  timestamptz;
  v_target  uuid;
  v_removed integer := 0;
  v_marked  uuid;
BEGIN
  IF p_applied_by IS NULL OR p_applied_by = '' THEN
    RAISE EXCEPTION 'reconcile_stage2_from_won: p_applied_by é obrigatório (trilha)';
  END IF;

  -- Paying manual (sem trilha automática) é soberano.
  IF EXISTS (
    SELECT 1 FROM public.calls c
    WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
      AND  c.stage2_outcome = 'paying'
      AND  NOT EXISTS (
             SELECT 1 FROM public.calls_data_corrections t
             WHERE  t.call_id = c.id AND t.column_name = 'stage2_outcome'
               AND  t.applied_by IN ('ghl_won_sync', '118_stage2_won_backfill')
           )
  ) THEN
    RETURN QUERY SELECT 0, NULL::uuid;
    RETURN;
  END IF;

  SELECT COALESCE(
           (SELECT l.won_at FROM public.ghl_leads l
            WHERE  l.org_id = p_org_id AND l.contact_id = p_contact_id AND l.status = 'won'),
           (SELECT max(c.ghl_won_at) FROM public.calls c
            WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id AND c.ghl_won_status = 'won'))
  INTO v_won_at;

  IF v_won_at IS NOT NULL THEN
    SELECT c.id INTO v_target
    FROM   public.calls c
    WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
      AND  c.is_sales_call IS DISTINCT FROM false
      AND  public.call_moment(c.call_date, c.created_at) < v_won_at
    ORDER  BY public.call_moment(c.call_date, c.created_at) DESC, c.created_at DESC
    LIMIT  1;
  END IF;

  -- Trilha primeiro; se falhar, a exceção desfaz tudo.
  INSERT INTO public.calls_data_corrections
    (call_id, column_name, old_value, new_value, applied_by, reason)
  SELECT c.id, v.column_name, v.old_value, 'null'::jsonb, p_applied_by,
         'Stage 2 automático removido: não é a call de venda anterior ao Won (regra 125)'
  FROM   public.calls c
  CROSS  JOIN LATERAL (VALUES
           ('stage2_outcome',   to_jsonb(c.stage2_outcome)),
           ('became_paying_at', to_jsonb(c.became_paying_at))
         ) AS v(column_name, old_value)
  WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
    AND  c.stage2_outcome = 'paying'
    AND  c.id IS DISTINCT FROM v_target;

  UPDATE public.calls c
  SET    stage2_outcome = NULL, became_paying_at = NULL
  WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
    AND  c.stage2_outcome = 'paying'
    AND  c.id IS DISTINCT FROM v_target;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  v_marked := public.mark_stage2_paying_from_won(p_org_id, p_contact_id, p_applied_by);

  RETURN QUERY SELECT v_removed, v_marked;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stage2_from_won(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stage2_from_won(uuid, text, text) TO service_role;

-- ── Aplicar o status do GHL a um lead ───────────────────────
-- p_ghl_status: o que o GHL diz HOJE do lead (resolvido no código: qualquer
-- opportunity won → 'won'; senão lost/open/abandoned/none). Won é definitivo.
-- p_applied_by: preenchido no backfill — grava trilha das calls alteradas
-- ANTES do UPDATE e revisa o Stage 2 (reconcile). Vazio no sync do dia a dia.
CREATE OR REPLACE FUNCTION public.apply_ghl_lead_status(
  p_org_id         uuid,
  p_contact_id     text,
  p_ghl_status     text,
  p_won_at         timestamptz,
  p_opportunity_id text,
  p_pipeline_id    text,
  p_stage_id       text,
  p_source         text,
  p_applied_by     text DEFAULT NULL
)
RETURNS TABLE (
  status          text,
  won_at          timestamptz,
  divergence      text,
  calls_updated   integer,
  stage2_removed  integer,
  stage2_marked   uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
-- status/won_at são nomes do RETURNS TABLE e também colunas de ghl_leads.
#variable_conflict use_column
DECLARE
  v_ghl        text := lower(btrim(COALESCE(p_ghl_status, 'none')));
  v_prev       public.ghl_leads%ROWTYPE;
  v_calls_won  boolean;
  v_calls_at   timestamptz;
  v_was_won    boolean;
  v_status     text;
  v_won_at     timestamptz;
  v_opp        text;
  v_pipe       text;
  v_stage      text;
  v_div        text;
  v_call_st    text;
  v_updated    integer := 0;
  v_removed    integer := 0;
  v_marked     uuid;
BEGIN
  IF v_ghl NOT IN ('won', 'lost', 'open', 'abandoned', 'none') THEN
    RAISE EXCEPTION 'apply_ghl_lead_status: status desconhecido %', p_ghl_status;
  END IF;

  SELECT * INTO v_prev FROM public.ghl_leads l
  WHERE  l.org_id = p_org_id AND l.contact_id = p_contact_id
  FOR UPDATE;

  SELECT bool_or(c.ghl_won_status = 'won'),
         max(c.ghl_won_at) FILTER (WHERE c.ghl_won_status = 'won')
  INTO   v_calls_won, v_calls_at
  FROM   public.calls c
  WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id;

  v_was_won := COALESCE(v_prev.status = 'won', false) OR COALESCE(v_calls_won, false);

  IF v_ghl = 'won' THEN
    v_status := 'won';
    v_won_at := COALESCE(p_won_at, v_prev.won_at, v_calls_at, now());
    v_opp    := p_opportunity_id;
    v_pipe   := p_pipeline_id;
    v_stage  := p_stage_id;
  ELSIF v_was_won THEN
    -- Won é definitivo: registra a divergência e mantém.
    v_status := 'won';
    v_won_at := COALESCE(v_prev.won_at, v_calls_at);
    v_opp    := v_prev.won_opportunity_id;
    v_pipe   := v_prev.won_pipeline_id;
    v_stage  := v_prev.won_stage_id;
    v_div    := 'ghl=' || v_ghl;
  ELSE
    v_status := v_ghl;
  END IF;

  INSERT INTO public.ghl_leads AS l
    (org_id, contact_id, status, won_at, won_opportunity_id, won_pipeline_id, won_stage_id,
     ghl_status, ghl_divergence, checked_at, source)
  VALUES
    (p_org_id, p_contact_id, v_status, v_won_at, v_opp, v_pipe, v_stage,
     v_ghl, v_div, now(), p_source)
  ON CONFLICT (org_id, contact_id) DO UPDATE
  SET status             = EXCLUDED.status,
      won_at             = EXCLUDED.won_at,
      won_opportunity_id = EXCLUDED.won_opportunity_id,
      won_pipeline_id    = EXCLUDED.won_pipeline_id,
      won_stage_id       = EXCLUDED.won_stage_id,
      ghl_status         = EXCLUDED.ghl_status,
      ghl_divergence     = EXCLUDED.ghl_divergence,
      checked_at         = EXCLUDED.checked_at,
      source             = EXCLUDED.source,
      updated_at         = now();

  -- O que as calls herdam: won/lost como status; open/abandoned/none → NULL.
  v_call_st := CASE WHEN v_status IN ('won', 'lost') THEN v_status END;
  IF v_status <> 'won' THEN v_won_at := NULL; END IF;

  IF p_applied_by IS NOT NULL THEN
    INSERT INTO public.calls_data_corrections
      (call_id, column_name, old_value, new_value, applied_by, reason)
    SELECT c.id, v.column_name, v.old_value, v.new_value, p_applied_by,
           'Won por lead (125): calls herdam o status do lead no GHL'
    FROM   public.calls c
    CROSS  JOIN LATERAL (VALUES
             ('ghl_won_status', to_jsonb(c.ghl_won_status), to_jsonb(v_call_st),
              c.ghl_won_status IS DISTINCT FROM v_call_st),
             ('ghl_won_at',     to_jsonb(c.ghl_won_at),     to_jsonb(v_won_at),
              c.ghl_won_at IS DISTINCT FROM v_won_at)
           ) AS v(column_name, old_value, new_value, changed)
    WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
      AND  v.changed;
  END IF;

  UPDATE public.calls c
  SET    ghl_won_status     = v_call_st,
         ghl_won_at         = v_won_at,
         ghl_opportunity_id = COALESCE(v_opp, p_opportunity_id, c.ghl_opportunity_id),
         updated_at         = now()
  WHERE  c.org_id = p_org_id AND c.contact_id = p_contact_id
    AND  (c.ghl_won_status IS DISTINCT FROM v_call_st
          OR c.ghl_won_at  IS DISTINCT FROM v_won_at);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_status = 'won' THEN
    IF p_applied_by IS NOT NULL THEN
      SELECT r.removed, r.marked INTO v_removed, v_marked
      FROM   public.reconcile_stage2_from_won(p_org_id, p_contact_id, p_applied_by) r;
    ELSE
      v_marked := public.mark_stage2_paying_from_won(p_org_id, p_contact_id);
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_won_at, v_div, v_updated, v_removed, v_marked;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text) IS
  'Grava o status do GHL em ghl_leads (Won definitivo), copia para as calls do lead e roda o Stage 2. Com p_applied_by: trilha antes do UPDATE e revisão do Stage 2 (backfill).';

-- ── Leads a revisitar no sync diário ────────────────────────
-- Contatos com call na org que ainda não são Won, os consultados há mais tempo
-- primeiro (nunca consultados antes de todos).
CREATE OR REPLACE FUNCTION public.ghl_leads_to_revisit(p_org_id uuid, p_limit integer)
RETURNS TABLE (contact_id text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.contact_id
  FROM   public.calls c
  LEFT   JOIN public.ghl_leads l
         ON l.org_id = c.org_id AND l.contact_id = c.contact_id
  WHERE  c.org_id = p_org_id
    AND  c.contact_id IS NOT NULL
  GROUP  BY c.contact_id, l.status, l.checked_at
  -- COALESCE: bool_or de calls todas sem status é NULL, e NOT NULL excluiria o lead.
  HAVING l.status IS DISTINCT FROM 'won'
     AND NOT COALESCE(bool_or(c.ghl_won_status = 'won'), false)
  ORDER  BY l.checked_at NULLS FIRST, max(c.created_at) DESC
  LIMIT  p_limit
$$;

REVOKE ALL ON FUNCTION public.ghl_leads_to_revisit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghl_leads_to_revisit(uuid, integer) TO service_role;

-- ── Won Rate: Won só conta se posterior à primeira call fechada ─
CREATE OR REPLACE FUNCTION public.org_won_rate(p_org_id uuid)
 RETURNS TABLE(trainer_id uuid, closed_leads bigint, won_leads bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Apelidos tid/cid de propósito: num LANGUAGE sql os nomes do RETURNS
  -- TABLE viram parâmetros OUT e disputam resolução de nome com as colunas
  -- do corpo. Sem nada chamado `trainer_id` aqui dentro, "column reference
  -- is ambiguous" fica impossível.
  WITH closed AS (
    -- is_sales_call IS DISTINCT FROM false: mesma regra do
    -- applySalesCallOnly (lib/sales-calls.ts). NULL = call legada,
    -- anterior ao gate de classificação, presumida venda.
    SELECT c.trainer_id AS tid, c.contact_id AS cid
    FROM   public.calls c
    WHERE  c.org_id       = p_org_id
      AND  c.call_outcome = 'closed'
      AND  c.contact_id IS NOT NULL
      AND  c.is_sales_call IS DISTINCT FROM false
  ),
  won AS (
    -- Um lead por linha (sem fan-out no LEFT JOIN). 125: o lead só conta
    -- como Won se o Won for POSTERIOR à primeira call fechada dele — Won
    -- anterior é cliente que já tinha comprado, não venda desta call.
    SELECT c.contact_id AS cid
    FROM   public.calls c
    WHERE  c.org_id = p_org_id
      AND  c.contact_id IS NOT NULL
      AND  c.is_sales_call IS DISTINCT FROM false
    GROUP  BY c.contact_id
    HAVING bool_or(c.ghl_won_status = 'won')
       AND max(c.ghl_won_at) FILTER (WHERE c.ghl_won_status = 'won')
           > min(public.call_moment(c.call_date, c.created_at)) FILTER (WHERE c.call_outcome = 'closed')
  )
  SELECT cl.tid,
         COUNT(DISTINCT cl.cid),
         COUNT(DISTINCT cl.cid) FILTER (WHERE w.cid IS NOT NULL)
  FROM       closed cl
  LEFT JOIN  won    w ON w.cid = cl.cid
  WHERE      cl.tid IS NOT NULL
  GROUP BY   cl.tid

  UNION ALL

  -- Sem GROUP BY, então sempre retorna exatamente 1 linha — (0,0) numa org
  -- sem nenhuma call 'closed'.
  SELECT NULL::uuid,
         COUNT(DISTINCT cl.cid),
         COUNT(DISTINCT cl.cid) FILTER (WHERE w.cid IS NOT NULL)
  FROM       closed cl
  LEFT JOIN  won    w ON w.cid = cl.cid
$function$;

-- ── Carimbo semanal: mesma regra no won_leads ───────────────
-- Corpo = pg_get_functiondef de PROD (01/10/2026); só o CTE `won` mudou.
CREATE OR REPLACE FUNCTION public.stamp_call_stats_weekly(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'live'::text)
 RETURNS TABLE(since timestamp with time zone, weeks_dirty bigint, rows_written bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job       constant text := 'stamp_call_stats_weekly';
  v_run_start timestamptz := now();
  v_since     timestamptz;
  v_weeks     bigint := 0;
  v_rows      bigint := 0;
BEGIN
  -- p_since explícito permite reprocessar um período à mão. Sem watermark e
  -- sem argumento, recalcula tudo — que é o que se quer no backfill.
  v_since := COALESCE(
    p_since,
    (SELECT w.cursor_at FROM public.job_watermarks w WHERE w.job_name = v_job),
    '-infinity'::timestamptz
  );

  -- ── Semanas sujas ───────────────────────────────────────────────────────
  -- Temp table em vez de CTE: o conjunto é lido três vezes adiante, e
  -- materializar uma vez é melhor que arriscar o planner recomputar.
  DROP TABLE IF EXISTS _semanas_sujas;
  CREATE TEMP TABLE _semanas_sujas ON COMMIT DROP AS
  WITH tocadas AS (
    SELECT DISTINCT
           c.org_id,
           c.contact_id,
           date_trunc('week', COALESCE(c.call_date, c.created_at::date))::date AS wk
    FROM   public.calls c
    WHERE  c.updated_at >= v_since
      AND  c.org_id IS NOT NULL
      -- SEM filtro de is_sales_call aqui, de propósito. Esta query pergunta
      -- "o que mudou?", não "o que conta?" — a contagem é filtrada no `base`
      -- abaixo. Com o filtro aqui, uma call reclassificada como não-venda
      -- sumiria da própria query que deveria notar a mudança: a semana nunca
      -- ficaria suja e o número dela ficaria congelado pra sempre.
  )
  SELECT DISTINCT u.org_id, u.wk
  FROM (
    -- a semana da própria call que mudou
    SELECT t.org_id, t.wk FROM tocadas t
    UNION
    -- e toda semana em que o MESMO lead agendou. Quando um lead compra, o
    -- que muda é ghl_won_status, mas a semana a recalcular é a do
    -- AGENDAMENTO, que costuma ser outra. Hoje o carimbo do GHL toca todas
    -- as calls do contato e a semana antiga seria pega mesmo sem isto — mas
    -- esse é um comportamento que consideramos bug em outro contexto, e no
    -- dia em que for corrigido a detecção quebraria em silêncio.
    SELECT c.org_id,
           date_trunc('week', COALESCE(c.call_date, c.created_at::date))::date
    FROM   public.calls c
    JOIN   tocadas t
      ON   t.org_id = c.org_id
     AND   t.contact_id = c.contact_id
    WHERE  c.call_outcome = 'closed'
      AND  c.is_sales_call IS DISTINCT FROM false
  ) u;

  GET DIAGNOSTICS v_weeks = ROW_COUNT;

  IF v_weeks > 0 THEN
    WITH base AS (
      SELECT c.org_id,
             c.trainer_id AS tid,
             s.wk,
             c.contact_id AS cid,
             c.call_outcome,
             c.overall_score,
             c.intent
      FROM   public.calls c
      JOIN   _semanas_sujas s
        ON   s.org_id = c.org_id
       AND   s.wk = date_trunc('week', COALESCE(c.call_date, c.created_at::date))::date
      WHERE  c.is_sales_call IS DISTINCT FROM false
        -- scoring_status: exclui calls com falha de scoring (§3.1) ou
        -- transcript vazado (§3.2) — zero nessas calls não é avaliação
        -- real, entraria em score_sum/score_count como se fosse (§0.3).
        AND  c.scoring_status IS DISTINCT FROM 'scoring_failed'
        AND  c.scoring_status IS DISTINCT FROM 'transcript_leaked'
    ),
    won AS (
      -- 125: lead Won só se o Won for posterior à primeira call fechada dele
      -- (mesma regra do org_won_rate). Um lead por linha.
      SELECT c.org_id, c.contact_id AS cid
      FROM   public.calls c
      WHERE  c.org_id IN (SELECT DISTINCT s.org_id FROM _semanas_sujas s)
        AND  c.contact_id IS NOT NULL
        AND  c.is_sales_call IS DISTINCT FROM false
      GROUP  BY c.org_id, c.contact_id
      HAVING bool_or(c.ghl_won_status = 'won')
         AND max(c.ghl_won_at) FILTER (WHERE c.ghl_won_status = 'won')
             > min(public.call_moment(c.call_date, c.created_at)) FILTER (WHERE c.call_outcome = 'closed')
    ),
    novo AS (
      SELECT b.org_id, b.tid, b.wk,
             COUNT(*)::int AS total_calls,
             COUNT(*) FILTER (WHERE b.call_outcome = 'closed')::int AS closed_calls,
             -- DISTINCT: 3 calls closed do mesmo lead na semana valem 1
             -- lead. cid NULL é ignorado pelo COUNT DISTINCT — é a call sem
             -- contato, que conta em total_calls e não aqui.
             COUNT(DISTINCT b.cid) FILTER (WHERE b.call_outcome = 'closed')::int AS closed_leads,
             COUNT(DISTINCT b.cid) FILTER (
               WHERE b.call_outcome = 'closed' AND w.cid IS NOT NULL
             )::int AS won_leads,
             -- Normaliza CADA call antes de somar, nunca o agregado depois.
             -- O predicado <= 5 é o MESMO da migration 043, que já converteu
             -- overall_score pra 0–100 e é idempotente: num banco onde a 043
             -- rodou isto é no-op, e defende contra uma linha pré-043
             -- reaparecer num restore.
             COALESCE(SUM(CASE WHEN b.overall_score <= 5
                               THEN b.overall_score * 20
                               ELSE b.overall_score END), 0)::numeric(12,2) AS score_sum,
             -- COUNT(coluna) ignora NULL — denominador certo, e por isso
             -- não é o mesmo número que total_calls.
             COUNT(b.overall_score)::int AS score_count,
             COALESCE(SUM(b.intent), 0)::numeric(12,2) AS intent_sum,
             COUNT(b.intent)::int AS intent_count
      FROM       base b
      -- `won` é DISTINCT por (org, cid), então o JOIN não multiplica linha
      -- nenhuma — COUNT(*) continua sendo o número de calls.
      LEFT JOIN  won  w ON w.org_id = b.org_id AND w.cid = b.cid
      GROUP BY GROUPING SETS ((b.org_id, b.tid, b.wk), (b.org_id, b.wk))
      -- Call com trainer_id NULL formaria um grupo "por vendedor" com tid
      -- NULL, colidindo com a linha da org no índice único. GROUPING()
      -- distingue o NULL do rollup do NULL que veio do dado.
      HAVING GROUPING(b.tid) = 1 OR b.tid IS NOT NULL

      UNION ALL

      -- Semana suja que ficou SEM nenhuma call contável — todas viraram
      -- não-venda, ou foram apagadas. Sem esta linha zerada o número
      -- anterior ficaria congelado e errado, que é pior que zero.
      SELECT s.org_id, NULL::uuid, s.wk,
             0, 0, 0, 0, 0::numeric(12,2), 0, 0::numeric(12,2), 0
      FROM   _semanas_sujas s
      WHERE  NOT EXISTS (
               SELECT 1 FROM base b WHERE b.org_id = s.org_id AND b.wk = s.wk
             )

      UNION ALL

      -- O mesmo pro VENDEDOR, e não é o mesmo caso: a org pode continuar
      -- com calls na semana enquanto um vendedor específico perde todas as
      -- dele (reclassificadas como não-venda, reatribuídas, apagadas). Sem
      -- isto, a org atualiza e a linha dele congela — pior ainda, porque
      -- fica plausível. Só zera quem JÁ tinha número naquela semana; não
      -- inventa linha pra vendedor que nunca apareceu.
      SELECT s.org_id, prev.trainer_id, s.wk,
             0, 0, 0, 0, 0::numeric(12,2), 0, 0::numeric(12,2), 0
      FROM   _semanas_sujas s
      CROSS JOIN LATERAL (
        SELECT DISTINCT w.trainer_id
        FROM   public.call_stats_weekly w
        WHERE  w.org_id     = s.org_id
          AND  w.week_start = s.wk
          AND  w.trainer_id IS NOT NULL
      ) prev
      WHERE NOT EXISTS (
        SELECT 1 FROM base b
        WHERE  b.org_id = s.org_id AND b.wk = s.wk AND b.tid = prev.trainer_id
      )
    )
    INSERT INTO public.call_stats_weekly (
      org_id, trainer_id, week_start, snapshot_at,
      total_calls, closed_calls, closed_leads, won_leads,
      score_sum, score_count, intent_sum, intent_count, source
    )
    SELECT n.org_id, n.tid, n.wk, v_run_start,
           n.total_calls, n.closed_calls, n.closed_leads, n.won_leads,
           n.score_sum, n.score_count, n.intent_sum, n.intent_count, p_source
    FROM novo n
    -- O snapshot mais recente daquela (org, vendedor, semana).
    LEFT JOIN LATERAL (
      SELECT s.*
      FROM   public.call_stats_weekly s
      WHERE  s.org_id     = n.org_id
        AND  s.trainer_id IS NOT DISTINCT FROM n.tid
        AND  s.week_start = n.wk
      ORDER  BY s.snapshot_at DESC
      LIMIT  1
    ) atual ON true
    -- TODAS as colunas medidas entram, não só as contagens de call: uma call
    -- reanalisada move score_sum sem mexer em contagem nenhuma. Compara os
    -- FATOS, não as médias geradas — que mudariam junto, mas com
    -- arredondamento capaz de esconder diferença pequena.
    WHERE atual.id IS NULL
       OR (atual.total_calls, atual.closed_calls, atual.closed_leads, atual.won_leads,
           atual.score_sum,   atual.score_count,  atual.intent_sum,   atual.intent_count)
          IS DISTINCT FROM
          (n.total_calls, n.closed_calls, n.closed_leads, n.won_leads,
           n.score_sum,   n.score_count,  n.intent_sum,   n.intent_count)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
  END IF;

  -- Avança o watermark mesmo sem ter gravado linha: a rodada aconteceu.
  --
  -- cursor_at recua 5 minutos de propósito: uma transação que commitou
  -- depois do nosso snapshot MVCC começar não é visível aqui, mas tem
  -- updated_at anterior a v_run_start. Sem a margem, ela seria pulada pra
  -- sempre. Sobreposição é inofensiva — a regra de só-gravar-se-mudou
  -- absorve o reprocessamento.
  INSERT INTO public.job_watermarks (job_name, ran_at, cursor_at)
  VALUES (v_job, v_run_start, v_run_start - interval '5 minutes')
  ON CONFLICT (job_name) DO UPDATE
    SET ran_at     = EXCLUDED.ran_at,
        cursor_at  = EXCLUDED.cursor_at,
        updated_at = now();

  RETURN QUERY SELECT v_since, v_weeks, v_rows;
END;
$function$;

COMMIT;

-- ── Rollback ────────────────────────────────────────────────
-- Recriar org_won_rate, stamp_call_stats_weekly e mark_stage2_paying_from_won(uuid, text)
-- a partir do pg_get_functiondef guardado ANTES de aplicar esta migration
-- (rodar e salvar a saída antes do deploy). Depois:
-- DROP FUNCTION IF EXISTS public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.reconcile_stage2_from_won(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.ghl_leads_to_revisit(uuid, integer);
-- DROP FUNCTION IF EXISTS public.mark_stage2_paying_from_won(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.call_moment(date, timestamptz);
-- DROP TABLE IF EXISTS public.ghl_rejected_calls;
-- DROP TABLE IF EXISTS public.ghl_leads;
