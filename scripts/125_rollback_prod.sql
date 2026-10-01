-- ============================================================
-- 125_rollback_prod.sql
--
-- Rollback da 125 em PROD: recria as 3 funções que a 125 reescreve, exatamente
-- como estavam em prod ANTES da 125 (pg_get_functiondef lido em 01/10/2026):
--
--   mark_stage2_paying_from_won(uuid, text)   md5 67c32db34df8a8d101e4351282218612
--   org_won_rate(uuid)                        md5 075453ab2012995d51894f23309eddbe
--   stamp_call_stats_weekly(timestamptz, text) md5 2c5586a238623868326dd8312a9193ce
--
-- Os corpos de prod tinham fim de linha CRLF em org_won_rate e
-- stamp_call_stats_weekly; aqui estão em LF. Sem \r, o md5 confere:
-- md5(replace(pg_get_functiondef(...), E'\r', '')) = f38d57b8… / 4ed9198e…
-- (verificado no PGlite contra este arquivo).
--
-- NÃO remove ghl_leads / ghl_rejected_calls nem as funções novas: o código
-- novo depende delas. Rodar só se for preciso voltar o Won Rate e o Stage 2
-- ao comportamento anterior; o bloco final (comentado) desfaz o resto.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.mark_stage2_paying_from_won(uuid, text, text);

CREATE OR REPLACE FUNCTION public.mark_stage2_paying_from_won(p_org_id uuid, p_contact_id text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  WITH alvo AS (
    SELECT c.id
    FROM   public.calls c
    WHERE  c.org_id = p_org_id
      AND  c.contact_id = p_contact_id
    ORDER  BY (c.is_sales_call IS TRUE) DESC,
              c.call_date DESC NULLS LAST,
              c.created_at DESC
    LIMIT  1
  ),
  marcada AS (
    UPDATE public.calls c
    SET    stage2_outcome   = 'paying',
           became_paying_at = COALESCE(c.ghl_won_at, now())
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
    SELECT m.id, v.column_name, 'null'::jsonb, v.new_value, 'ghl_won_sync',
           'GHL Won → Stage 2 paying (mark_stage2_paying_from_won)'
    FROM   marcada m
    CROSS  JOIN LATERAL (VALUES
             ('stage2_outcome',   to_jsonb('paying'::text)),
             ('became_paying_at', to_jsonb(m.became_paying_at))
           ) AS v(column_name, new_value)
    RETURNING 1
  )
  SELECT id FROM marcada;
$function$;

REVOKE ALL ON FUNCTION public.mark_stage2_paying_from_won(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stage2_paying_from_won(uuid, text) TO service_role;

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
    -- DISTINCT evita fan-out no LEFT JOIN: sem ele, um lead com 6 calls
    -- carimbadas multiplicaria as linhas de `closed`.
    SELECT DISTINCT c.contact_id AS cid
    FROM   public.calls c
    WHERE  c.org_id         = p_org_id
      AND  c.ghl_won_status = 'won'
      AND  c.contact_id IS NOT NULL
      AND  c.is_sales_call IS DISTINCT FROM false
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
      SELECT DISTINCT c.org_id, c.contact_id AS cid
      FROM   public.calls c
      WHERE  c.org_id IN (SELECT DISTINCT s.org_id FROM _semanas_sujas s)
        AND  c.ghl_won_status = 'won'
        AND  c.contact_id IS NOT NULL
        AND  c.is_sales_call IS DISTINCT FROM false
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

-- ── Desfazer o resto da 125 (só junto com o revert do código) ──
-- DROP FUNCTION IF EXISTS public.apply_ghl_lead_status(uuid, text, text, timestamptz, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.reconcile_stage2_from_won(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.ghl_leads_to_revisit(uuid, integer);
-- DROP FUNCTION IF EXISTS public.call_moment(date, timestamptz);
-- DROP TABLE IF EXISTS public.ghl_rejected_calls;
-- DROP TABLE IF EXISTS public.ghl_leads;
