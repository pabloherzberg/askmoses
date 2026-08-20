-- ============================================================
-- 107_won_rate_and_weekly_stats.sql
--
-- Won Rate + a tabela de agregados semanais. Uma migration só, porque as
-- peças não fazem sentido separadas: a tabela precisa da regra de contagem,
-- o carimbo precisa da tabela, e o índice existe só pra sustentar o carimbo.
--
--   1. org_won_rate ............ o número AGORA, lido direto de `calls`
--   2. call_stats_weekly ....... o histórico, semana a semana, append-only
--   3. job_watermarks .......... até onde o carimbo já processou
--   4. stamp_call_stats_weekly . recalcula o que mudou e grava
--   5. calls.updated_at ........ índice + trigger que sustentam o item 4
--   6. backfill ................ o item 4 aplicado ao histórico existente
--
-- ─── As duas métricas ───────────────────────────────────────────────────────
--
--   close rate = closed_calls / total_calls    (por CALL)
--   won rate   = won_leads    / closed_leads   (por LEAD)
--
-- `call_outcome = 'closed'` É "avaliação agendada" — é a definição de
-- sucesso do Stage 1 (lib/services/stage-config.ts).
--
-- POR LEAD, NUNCA POR CALL. dbUpdateGhlOpportunity (lib/db/calls.ts) carimba
-- ghl_won_status em TODAS as calls do contato, sem filtro de outcome.
-- Contando call, um lead com 6 ligações e 1 venda vira 6 vendas e o rate
-- estoura 100%. COUNT(DISTINCT contact_id) é imune: carimbar 1 ou 6 calls do
-- mesmo lead dá o mesmo número.
--
-- O numerador exige 'closed' também, e não é redundância. Um lead won SEM
-- nenhuma call 'closed' (upload manual, call sem contact_id, backfill
-- parcial) entraria só no numerador e passaria de 100%. Aqui as duas
-- contagens saem da MESMA varredura de `closed` — o LEFT JOIN não
-- acrescenta lead nenhum, só marca quais dos já contados venceram. O
-- numerador é sempre subconjunto do denominador, podendo ser IGUAL, que é o
-- 100% legítimo de quem fechou tudo que agendou.
--
-- A LINHA DA ORG NÃO É A SOMA DAS LINHAS DE VENDEDOR. Um lead atendido por
-- dois conta 1x na org e 1x em cada um deles. Por isso a org tem DISTINCT
-- próprio (linha trainer_id NULL) em vez de ser somada no TypeScript. Se um
-- dia bater com a soma, é sinal de bug.
--
-- ─── Fatos, nunca resultados ────────────────────────────────────────────────
--
-- call_stats_weekly é um LOG pra análise estatística, não cache de tela.
-- Guarda só o que é aditivo — contagem e soma — e nada já dividido. Toda
-- divisão acontece na leitura.
--
-- Vale igual pra taxa e pra média, pelo mesmo motivo: as duas jogam fora o
-- denominador. Média de médias é errada quando os N diferem — semana de 3
-- calls com média 80 e semana de 30 com média 60 dão 61.8, não 70.
-- Guardando o que é aditivo, qualquer recorte fecha: semanas em mês,
-- vendedores em time, org por período.
--
-- Os três denominadores são diferentes de propósito. Call sem contact_id
-- entra em total_calls e fica fora de closed_leads; call sem nota entra em
-- total_calls e fica fora de score_count. Cada métrica conta a população
-- sobre a qual ela faz sentido.
--
-- ─── snapshot_at no grain ───────────────────────────────────────────────────
--
-- won_leads AMADURECE: um lead que agenda esta semana pode comprar daqui a
-- um mês. Cada carimbo registra "das avaliações da semana X, tantas já
-- tinham virado venda até aqui". Recarimbar não corrige o passado —
-- acrescenta uma leitura mais madura ao lado, e a anterior fica pra
-- auditoria. Leitura do número corrente:
--
--     SELECT DISTINCT ON (trainer_id, week_start) *
--     FROM   public.call_stats_weekly
--     WHERE  org_id = $1
--     ORDER  BY trainer_id, week_start DESC, snapshot_at DESC;
--
-- ATRIBUIÇÃO: a semana é a do AGENDAMENTO, não a da venda. closed_leads são
-- os leads que agendaram naquela semana; won_leads é quantos DAQUELES já
-- compraram.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. org_won_rate — o número agora
-- ════════════════════════════════════════════════════════════
--
-- Uma linha por vendedor + uma com trainer_id NULL pra org inteira.
-- Global e sem recorte de período, igual ao dbGetOrgCloseRate.

CREATE OR REPLACE FUNCTION public.org_won_rate(p_org_id uuid)
RETURNS TABLE (trainer_id uuid, closed_leads bigint, won_leads bigint)
LANGUAGE sql
STABLE
-- SECURITY INVOKER (o default) de propósito, NÃO definer. A função recebe
-- p_org_id solto: como definer, qualquer usuário logado que conseguisse
-- executá-la leria os agregados de outra org só trocando o argumento. Como
-- invoker ela respeita a RLS de `calls`, e o único chamador real é o
-- createAdminClient() (service_role), que passa por cima da RLS de qualquer
-- jeito. O REVOKE ao final fecha o resto.
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.org_won_rate(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.org_won_rate(uuid) TO service_role;


-- ════════════════════════════════════════════════════════════
-- 2. call_stats_weekly — o histórico
-- ════════════════════════════════════════════════════════════
--
-- Só agregado. Nenhum transcript, nome de prospect ou contact_id — a tabela
-- guarda CONTAGENS. Por isso o dado de um cliente que cancelou pode ficar:
-- não é dado dele, é estatística.

CREATE TABLE IF NOT EXISTS public.call_stats_weekly (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT, não CASCADE: apagar uma org não pode levar o histórico
  -- estatístico junto. Não atrapalha o rollback de onboarding
  -- (app/api/onboarding/organization/route.ts), que apaga org recém-criada,
  -- ainda sem linha aqui.
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- NULL = linha da org inteira. SET NULL ao demitir: os números do
  -- vendedor continuam somando no total da org, só perdem a atribuição.
  trainer_id    uuid REFERENCES public.trainers(id) ON DELETE SET NULL,

  week_start    date NOT NULL,                       -- segunda-feira

  -- timestamptz e não date: com granularidade de dia, duas rodadas no mesmo
  -- dia colidiriam no grain e a segunda seria descartada pelo ON CONFLICT,
  -- perdendo a mudança em silêncio. Quem impede linha repetida é a regra de
  -- só-gravar-se-mudou, que é o mecanismo certo pra isso.
  snapshot_at   timestamptz NOT NULL DEFAULT now(),

  total_calls   int  NOT NULL DEFAULT 0,             -- calls FEITAS na semana
  closed_calls  int  NOT NULL DEFAULT 0,             -- dessas, quantas agendaram
  closed_leads  int  NOT NULL DEFAULT 0,             -- leads que agendaram na semana
  won_leads     int  NOT NULL DEFAULT 0,             -- DAQUELES, quantos compraram

  -- score_count é separado de total_calls porque call sem nota existe
  -- (pipeline que falhou, call não analisada). Usar total_calls como
  -- denominador afundaria a média com zeros que não são zeros.
  --
  -- Escala 0–100, a MESMA de calls.overall_score desde a migration 043. Não
  -- é 0–5: esse é o formato de exibição, produzido por toDisplay5() (s/20).
  score_sum     numeric(12,2) NOT NULL DEFAULT 0,
  score_count   int           NOT NULL DEFAULT 0,

  -- calls.intent é SMALLINT 0–5, sem histórico de escala misturada.
  intent_sum    numeric(12,2) NOT NULL DEFAULT 0,
  intent_count  int           NOT NULL DEFAULT 0,

  -- Conveniência pra quem só quer olhar a linha. GENERATED: derivadas pelo
  -- próprio banco, então não têm como divergir do fato. NULLIF evita divisão
  -- por zero — semana sem nota dá NULL, que é honesto ("não há média"),
  -- diferente de 0 ("a média é zero").
  avg_score     numeric GENERATED ALWAYS AS
                  (ROUND(score_sum  / NULLIF(score_count,  0), 2)) STORED,
  avg_intent    numeric GENERATED ALWAYS AS
                  (ROUND(intent_sum / NULLIF(intent_count, 0), 2)) STORED,

  -- 'backfill' = reconstruído de dados que já podem ter sido sobrescritos.
  -- 'live' = carimbado na época. Separar é o que permite não misturar as
  -- duas qualidades numa análise.
  source        text NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'backfill')),

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- O grain. COALESCE porque NULL não colide com NULL num índice único, e sem
-- isso a linha da org poderia ser duplicada no mesmo carimbo.
CREATE UNIQUE INDEX IF NOT EXISTS call_stats_weekly_grain
  ON public.call_stats_weekly (
    org_id,
    COALESCE(trainer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    week_start,
    snapshot_at
  );

CREATE INDEX IF NOT EXISTS call_stats_weekly_read
  ON public.call_stats_weekly (org_id, week_start DESC, snapshot_at DESC);

COMMENT ON TABLE public.call_stats_weekly IS
  'Agregados semanais por org e vendedor. Append-only: corrigir = inserir um novo snapshot_at, nunca UPDATE. trainer_id NULL = linha da org.';

-- Append-only de verdade, não por convenção. Sem isto, "append-only" é só um
-- comentário que o primeiro UPDATE desmente. O dono da tabela (postgres, no
-- SQL editor) ainda consegue mexer — é a saída de emergência, e ela fica
-- registrada por ser incomum.
REVOKE UPDATE, DELETE ON public.call_stats_weekly FROM anon, authenticated, service_role;
GRANT  SELECT, INSERT ON public.call_stats_weekly TO service_role;

-- RLS ligada sem policy pra anon/authenticated: ninguém lê pelo PostgREST.
-- O acesso é só pelo createAdminClient() (service_role, que ignora RLS).
ALTER TABLE public.call_stats_weekly ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- 3. job_watermarks — até onde o carimbo processou
-- ════════════════════════════════════════════════════════════
--
-- Precisa ser gravado mesmo quando a rodada não produz linha nenhuma.
-- Derivar o watermark de MAX(created_at) da própria call_stats_weekly tem um
-- bug fatal: a primeira rodada 'live' não encontra diferença contra o
-- backfill, não grava nada, e o watermark fica NULL pra sempre — fazendo
-- TODA rodada recalcular a história inteira.
--
-- Estado de job não é fato estatístico, então não polui a tabela de fatos.

CREATE TABLE IF NOT EXISTS public.job_watermarks (
  job_name   text        PRIMARY KEY,
  ran_at     timestamptz NOT NULL,   -- início da última rodada
  cursor_at  timestamptz NOT NULL,   -- processado até aqui
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_watermarks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.job_watermarks TO service_role;

COMMENT ON TABLE public.job_watermarks IS
  'Até onde cada job já processou. Apagar uma linha força o job a recalcular tudo — seguro, só caro.';


-- ════════════════════════════════════════════════════════════
-- 4. stamp_call_stats_weekly — recalcula o que mudou e grava
-- ════════════════════════════════════════════════════════════
--
-- Toda a agregação fica no banco. Trazer as calls das semanas sujas pra
-- memória só pra contá-las seria o oposto do que a org_won_rate evita. A
-- rota /api/cron/snapshot-weekly só autentica, chama e reporta.
--
-- Duas regras:
--
--   QUAIS semanas   as que deixaram de estar corretas, descobertas por
--                   calls.updated_at — não uma janela fixa. Janela fixa
--                   nunca pega correção em call antiga: outcome corrigido,
--                   call reanalisada, contact_id backfillado seis meses
--                   depois.
--
--   QUANDO gravar   só quando algum valor mudou de fato. Recarimbar semana
--                   parada gravaria linha idêntica com outro snapshot_at:
--                   barato em disco, caro de ler — obrigaria quem audita a
--                   separar mudança real de rodada de cron. Com a regra,
--                   toda linha existente é um fato novo.
--
-- É a MESMA função que faz o backfill (seção 6), só com p_source diferente.
-- Duas cópias da regra de contagem divergiriam.

CREATE OR REPLACE FUNCTION public.stamp_call_stats_weekly(
  p_since  timestamptz DEFAULT NULL,
  p_source text        DEFAULT 'live'
)
RETURNS TABLE (since timestamptz, weeks_dirty bigint, rows_written bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_call_stats_weekly(timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.stamp_call_stats_weekly(timestamptz, text)
  TO service_role;


-- ════════════════════════════════════════════════════════════
-- 5. calls.updated_at — o que sustenta a seção 4
-- ════════════════════════════════════════════════════════════
--
-- Btree e não BRIN: BRIN depende de correlação física entre valor e posição
-- no disco, e updated_at não tem — um UPDATE numa call de seis meses atrás
-- grava um valor recente numa página antiga. Em created_at BRIN faria
-- sentido; aqui degeneraria pra varredura.
--
-- Só updated_at, sem org_id junto: a consulta filtra por data e não por org
-- (o carimbo roda pra todas de uma vez), então updated_at tem que ser a
-- coluna líder e a segunda não filtraria nada.
--
-- NOTA DE EXECUÇÃO: em `calls` grande isto pega ACCESS EXCLUSIVE e bloqueia
-- escrita durante a construção. Se já for grande em produção, rode a
-- variante abaixo FORA de transação (o SQL editor do Supabase envolve o
-- script numa; nesse caso rode essa linha sozinha, antes do resto):
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_updated_at_idx
--     ON public.calls (updated_at);

CREATE INDEX IF NOT EXISTS calls_updated_at_idx
  ON public.calls (updated_at);

-- Hoje updated_at é convenção da aplicação: todos os caminhos de UPDATE em
-- lib/db/calls.ts e lib/db/call-chunks.ts setam na mão. Funciona, mas nada
-- obriga. Um caminho novo que esqueça deixa a call invisível pro carimbo, e
-- a falha é silenciosa: nenhum erro, só um número que para de atualizar.
--
-- Sobrescreve o que a aplicação mandou, de propósito: com o banco como fonte
-- única, "esquecer de setar" deixa de ser possível. Nenhum caminho atual
-- manda algo diferente de now(), então não muda comportamento hoje.
--
-- Incondicional, sem WHEN (OLD.* IS DISTINCT FROM NEW.*): a aplicação já
-- inclui updated_at no patch, o que tornaria o WHEN sempre verdadeiro de
-- qualquer jeito. E errar pra cima é barato — um UPDATE que não muda nada
-- suja a semana, o carimbo recalcula, vê que é igual e não grava.
--
-- EFEITO COLATERAL: um UPDATE em massa (backfill, correção de dados) move
-- updated_at de todas as linhas tocadas, e o carimbo seguinte recalcula
-- todas as semanas envolvidas. É correto — o dado mudou mesmo — mas é uma
-- rodada cara, e é bom saber por quê antes de estranhar.
--
-- Convive com trg_sync_closed (migration 036): os dois são BEFORE ROW e
-- mexem em colunas diferentes, então a ordem entre eles é indiferente.

CREATE OR REPLACE FUNCTION public.calls_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calls_updated_at ON public.calls;
CREATE TRIGGER trg_calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.calls_touch_updated_at();


-- ════════════════════════════════════════════════════════════
-- 6. Backfill
-- ════════════════════════════════════════════════════════════
--
-- É a MESMA função da seção 4, com since = -infinity (tudo) e source =
-- 'backfill'. Nenhuma lógica de contagem duplicada.
--
-- Marcado 'backfill' porque é reconstrução, não observação: o
-- dbUpdateGhlOpportunity sobrescreve ghl_won_status/ghl_opportunity_id em
-- todas as calls do contato, então um lead que comprou DUAS vezes aparece
-- hoje como uma compra só. Daqui pra frente o carimbo preserva a evidência;
-- para trás não há como separar.
--
-- Roda UMA vez na vida. Sem o guard, reaplicar a migration noutro dia criaria
-- um segundo backfill — válido pelo grain, e enganoso na análise.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.call_stats_weekly WHERE source = 'backfill') THEN
    PERFORM public.stamp_call_stats_weekly('-infinity'::timestamptz, 'backfill');
  END IF;
END $$;


-- ============================================================
-- Rollback:
--   DROP TRIGGER   IF EXISTS trg_calls_updated_at ON public.calls;
--   DROP FUNCTION  IF EXISTS public.calls_touch_updated_at();
--   DROP INDEX     IF EXISTS public.calls_updated_at_idx;
--   DROP FUNCTION  IF EXISTS public.stamp_call_stats_weekly(timestamptz, text);
--   DROP TABLE     IF EXISTS public.job_watermarks;
--   DROP TABLE     IF EXISTS public.call_stats_weekly;
--   DROP FUNCTION  IF EXISTS public.org_won_rate(uuid);
-- ============================================================
