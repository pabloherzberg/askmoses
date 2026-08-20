-- ============================================================
-- 107_won_rate_and_weekly_stats.test.sql
-- Smoke test de org_won_rate contra o schema REAL, depois de aplicar a
-- migration. Cobre os 7 cenários que separam a implementação certa da errada.
--
-- A lógica completa (carimbo semanal, backfill, append-only, trigger) é
-- coberta por tests/tc-won-rate-sql.test.ts, que aplica a migration num
-- Postgres real via PGlite e roda no `npm test`. Este arquivo existe pra
-- confirmar o mesmo comportamento no banco de verdade, onde o schema é o de
-- produção e não o mínimo do teste.
--
-- COMO RODAR: cole inteiro no SQL editor do Supabase e execute.
--
-- Não grava nada. Monta o fixture, confere, e termina com RAISE
-- EXCEPTION — que aborta a transação e desfaz tudo. Por isso o
-- resultado aparece como MENSAGEM DE ERRO: é o relatório, não uma
-- falha. Leia o PASS/FAIL de cada linha.
--
-- Pré-requisito: 107_org_won_rate.sql já aplicado.
-- ============================================================

DO $$
DECLARE
  v_org    uuid := gen_random_uuid();  -- a única linha realmente criada
  v_rubric uuid;                       -- emprestados do banco
  v_t1     uuid;
  v_t2     uuid;
  v_report text;
  v_fails  int;
BEGIN
  -- ─── Fixture ──────────────────────────────────────────────────────────────
  --
  -- NÃO cria vendedor nem rubrica: empresta ids que já existem. `trainers`
  -- tem 18 colunas e `calls` tem 51, com NOT NULLs que nenhum script em
  -- scripts/ descreve (user_id e owner_id, por exemplo). Listar colunas na
  -- mão quebra a cada uma que for adicionada.
  --
  -- Emprestar funciona porque org_won_rate lê SÓ public.calls e agrupa por
  -- trainer_id — nunca faz join com trainers. Os ids emprestados são apenas
  -- LIDOS; nada neles muda.
  SELECT id INTO v_t1     FROM public.trainers ORDER BY id LIMIT 1;
  SELECT id INTO v_t2     FROM public.trainers WHERE id <> v_t1 ORDER BY id LIMIT 1;
  SELECT id INTO v_rubric FROM public.rubrics  ORDER BY id LIMIT 1;

  IF v_t1 IS NULL OR v_t2 IS NULL OR v_rubric IS NULL THEN
    RAISE EXCEPTION 'Precisa de ao menos 2 linhas em trainers e 1 em rubrics para emprestar ids.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.calls) THEN
    RAISE EXCEPTION 'Precisa de ao menos 1 call no banco — o fixture clona a estrutura de uma existente.';
  END IF;

  -- A org é a ÚNICA coisa criada, e é nova de propósito: org_won_rate filtra
  -- por org_id, e é isso que isola o fixture dos dados reais.
  INSERT INTO public.organizations (id, name) VALUES (v_org, 'TESTE org_won_rate');

  -- As calls são CLONADAS de uma existente, trocando só o que o teste mede.
  -- Assim toda coluna obrigatória — as de hoje e as que vierem — já vem
  -- preenchida da linha de origem, e nunca mais é preciso adivinhar.
  INSERT INTO public.calls
  SELECT (jsonb_populate_record(
            NULL::public.calls,
            to_jsonb(src) || jsonb_build_object(
              'id',             gen_random_uuid(),
              'org_id',         v_org,
              'rubric_id',      v_rubric,
              'trainer_id',     f.tid,
              'contact_id',     f.contato,
              'call_outcome',   f.outcome,
              'ghl_won_status', f.won,
              'is_sales_call',  f.venda,
              -- `calls` tem dois índices únicos parciais: external_call_id, e
              -- (org_id, ghl_message_id). Clonar 15 linhas da mesma origem
              -- colidiria consigo mesmo. Ambos são parciais em IS NOT NULL,
              -- então zerar resolve.
              'external_call_id',   NULL::text,
              'ghl_message_id',     NULL::text,
              'ghl_opportunity_id', NULL::text
            )
         )).*
  FROM      (SELECT * FROM public.calls LIMIT 1) src
  CROSS JOIN (VALUES
    -- (1) O BUG DO CARIMBO — 6 calls do mesmo lead, só 1 agendou, mas o
    --     webhook marcou 'won' em todas. Contando call daria 6/6.
    (v_t1, 'L1', 'closed',     'won', true),
    (v_t1, 'L1', 'not_closed', 'won', true),
    (v_t1, 'L1', 'not_closed', 'won', true),
    (v_t1, 'L1', 'not_closed', 'won', true),
    (v_t1, 'L1', 'not_closed', 'won', true),
    (v_t1, 'L1', 'not_closed', 'won', true),

    -- (2) WON SEM AGENDAMENTO — comprou mas nenhuma call fechou. Se
    --     entrasse só no numerador, o rate passaria de 100%.
    (v_t1, 'L2', 'not_closed', 'won', true),

    -- (3) AGENDOU E NÃO COMPROU — denominador sim, numerador não.
    (v_t1, 'L3', 'closed',     NULL,  true),

    -- (4) CALL SEM contact_id — upload manual / anterior ao backfill 102.
    --     Fora dos dois lados, mesmo sendo closed + won.
    (v_t1, NULL, 'closed',     'won', true),

    -- (5) LEAD DE DOIS VENDEDORES — 1x na org, 1x em cada um deles.
    (v_t1, 'L5', 'closed',     'won', true),
    (v_t2, 'L5', 'closed',     'won', true),

    -- (6) NÃO É CALL DE VENDA — is_sales_call = false, ignorada.
    (v_t2, 'L6', 'closed',     'won', false),

    -- (7) REAGENDOU — 3 calls closed do mesmo lead contam 1, não 3.
    (v_t2, 'L7', 'closed',     NULL,  true),
    (v_t2, 'L7', 'closed',     NULL,  true),
    (v_t2, 'L7', 'closed',     NULL,  true)
  ) AS f(tid, contato, outcome, won, venda);

  -- ─── Esperado ─────────────────────────────────────────────────────────────
  --   ORG  closed = L1,L3,L5,L7 = 4   won = L1,L5 = 2
  --   T1   closed = L1,L3,L5    = 3   won = L1,L5 = 2
  --   T2   closed = L5,L7       = 2   won = L5    = 1
  --
  --   Repare: 3 + 2 = 5 ≠ 4. O lead L5 conta em cada vendedor e uma vez
  --   só na org. Se a org batesse com a soma, seria SINAL DE BUG.

  WITH actual AS (
    SELECT * FROM public.org_won_rate(v_org)
  ),
  esperado(ord, rotulo, tid, closed, won) AS (
    VALUES
      (1, 'ORG (total)',  NULL::uuid, 4, 2),
      (2, 'Vendedor 1',   v_t1,       3, 2),
      (3, 'Vendedor 2',   v_t2,       2, 1)
  ),
  cmp AS (
    SELECT e.ord, e.rotulo, e.closed, e.won,
           a.closed_leads, a.won_leads,
           CASE
             WHEN a.closed_leads IS NULL          THEN 'FAIL (linha ausente)'
             WHEN a.closed_leads = e.closed
              AND a.won_leads    = e.won          THEN 'PASS'
             ELSE                                      'FAIL'
           END AS veredito
    FROM      esperado e
    LEFT JOIN actual   a ON a.trainer_id IS NOT DISTINCT FROM e.tid
  )
  SELECT string_agg(
           format('  %-13s  esperado won/closed = %s/%s   obtido = %s/%s   %s',
                  rotulo, won, closed,
                  COALESCE(won_leads::text, '—'),
                  COALESCE(closed_leads::text, '—'),
                  veredito),
           E'\n' ORDER BY ord),
         COUNT(*) FILTER (WHERE veredito <> 'PASS')
    INTO v_report, v_fails
  FROM cmp;

  -- Invariante que nunca pode quebrar: o numerador é subconjunto do
  -- denominador. Se escapar, o rate passa de 100%.
  IF EXISTS (SELECT 1 FROM public.org_won_rate(v_org) WHERE won_leads > closed_leads) THEN
    v_fails  := v_fails + 1;
    v_report := v_report || E'\n  INVARIANTE    won_leads > closed_leads em alguma linha   FAIL';
  ELSE
    v_report := v_report || E'\n  INVARIANTE    won_leads <= closed_leads em toda linha   PASS';
  END IF;

  RAISE EXCEPTION E'\n\n===== org_won_rate: % =====\n%\n\n(transação desfeita — nada foi gravado)\n',
    CASE WHEN v_fails = 0 THEN 'TUDO PASSOU' ELSE v_fails || ' FALHA(S)' END,
    v_report;
END $$;
