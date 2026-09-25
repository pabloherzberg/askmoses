-- ============================================================
-- 118_stage2_won_backfill.sql
--
-- Backfill do Stage 2 para contatos que já estavam WON no GHL antes da 117.
-- Mesma regra da mark_stage2_paying_from_won (uma call por contato; só
-- stage2_outcome IS NULL; nada se o contato já tem 'paying'), com UMA
-- diferença: became_paying_at fica NULL.
--
-- POR QUE NULL: ghl_won_at não é a data do WON. Até a correção que acompanha
-- esta migration, dbUpdateGhlOpportunity regravava ghl_won_at = now() a cada
-- sync, e o cron sincroniza todas as oportunidades won todo dia — em
-- 25/09/2026, 299 das 320 calls won tinham ghl_won_at do próprio dia. Copiar
-- essa data para became_paying_at gravaria uma data sem significado. NULL diz
-- "virou pagante, data desconhecida"; o reason da trilha registra isso.
--
-- ORDEM DE DEPLOY: 117 → 118 → código. Se o código subir antes, o cron diário
-- chama mark_stage2_paying_from_won para os contatos won e marca paying com
-- became_paying_at = ghl_won_at (a data errada, do dia do sync) — o backfill
-- ficaria vazio e as datas, erradas.
--
-- Idempotente na prática: rodar de novo marca 0 linhas, o que diverge de
-- v_esperado e aborta sem efeito.
--
-- Medido em 25/09/2026 (prod, só leitura): 199 contatos won, 198 calls a
-- marcar em 10 orgs (131 de venda, 67 pela regra de fallback), 1 contato
-- pulado porque a call escolhida está 'pending' (manual é soberano).
-- ============================================================

-- ── Pré-visualização (rodar antes, só leitura) ─────────────
-- WITH won AS (
--   SELECT DISTINCT org_id, contact_id FROM public.calls
--   WHERE ghl_won_status = 'won' AND contact_id IS NOT NULL
-- ),
-- alvo AS (
--   SELECT DISTINCT ON (c.org_id, c.contact_id)
--          c.id, c.org_id, c.contact_id, c.stage2_outcome, c.is_sales_call
--   FROM public.calls c JOIN won USING (org_id, contact_id)
--   ORDER BY c.org_id, c.contact_id,
--            (c.is_sales_call IS TRUE) DESC, c.call_date DESC NULLS LAST, c.created_at DESC
-- )
-- SELECT count(*)                                            AS contatos_won,
--        count(*) FILTER (WHERE a.stage2_outcome IS NULL
--          AND NOT EXISTS (SELECT 1 FROM public.calls p
--                          WHERE p.org_id = a.org_id AND p.contact_id = a.contact_id
--                            AND p.stage2_outcome = 'paying')) AS calls_a_marcar,
--        count(*) FILTER (WHERE a.stage2_outcome IS NOT NULL) AS pulados_stage2_manual
-- FROM alvo a;

-- ── Execução autoverificada ─────────────────────────────────
-- O SQL Editor do Supabase não pausa entre statements, então a conferência
-- não pode depender de alguém olhar um SELECT antes do COMMIT. O DO block
-- abaixo marca, conta, e aborta com RAISE EXCEPTION se o número divergir de
-- v_esperado — o bloco é atômico, a exceção desfaz o UPDATE e a trilha.
--
-- ANTES DE RODAR: execute a prévia acima e ajuste v_esperado para o
-- calls_a_marcar dela. Rodar de novo depois de aplicado marca 0 e aborta
-- (sem efeito) — é o esperado.

DO $$
DECLARE
  v_esperado CONSTANT int := 198;  -- = calls_a_marcar da prévia (25/09/2026)
  v_marcadas int;
BEGIN
  WITH won AS (
    SELECT DISTINCT org_id, contact_id
    FROM   public.calls
    WHERE  ghl_won_status = 'won'
      AND  contact_id IS NOT NULL
  ),
  alvo AS (
    SELECT DISTINCT ON (c.org_id, c.contact_id) c.id, c.org_id, c.contact_id
    FROM   public.calls c
    JOIN   won USING (org_id, contact_id)
    ORDER  BY c.org_id, c.contact_id,
              (c.is_sales_call IS TRUE) DESC,
              c.call_date DESC NULLS LAST,
              c.created_at DESC
  ),
  marcada AS (
    UPDATE public.calls c
    SET    stage2_outcome   = 'paying',
           became_paying_at = NULL
    FROM   alvo a
    WHERE  c.id = a.id
      AND  c.stage2_outcome IS NULL
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.calls p
             WHERE  p.org_id = a.org_id
               AND  p.contact_id = a.contact_id
               AND  p.stage2_outcome = 'paying'
           )
    RETURNING c.id
  )
  INSERT INTO public.calls_data_corrections
    (call_id, column_name, old_value, new_value, applied_by, reason)
  SELECT id, 'stage2_outcome', 'null'::jsonb, to_jsonb('paying'::text),
         '118_stage2_won_backfill',
         'Backfill GHL Won → Stage 2 paying. became_paying_at fica NULL: ghl_won_at era regravado a cada sync e não é a data real do WON.'
  FROM   marcada;

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  IF v_marcadas <> v_esperado THEN
    RAISE EXCEPTION '118_stage2_won_backfill: marcaria % calls, esperado %. Nada foi gravado. Rode a prévia e ajuste v_esperado.',
      v_marcadas, v_esperado;
  END IF;

  RAISE NOTICE '118_stage2_won_backfill: % calls marcadas como paying.', v_marcadas;
END
$$;

-- ── Rollback ────────────────────────────────────────────────
-- UPDATE public.calls SET stage2_outcome = NULL, became_paying_at = NULL
-- WHERE id IN (SELECT call_id FROM public.calls_data_corrections
--              WHERE applied_by = '118_stage2_won_backfill');
-- DELETE FROM public.calls_data_corrections WHERE applied_by = '118_stage2_won_backfill';
