-- ============================================================
-- 117_stage2_from_ghl_won.sql
--
-- Stage 2 passa a ser preenchido a partir do WON do GHL.
--
-- CONTEXTO: o "paying client" do Stage 2 (092) é o mesmo fato que o WON da
-- oportunidade no GHL (096), que já chega sozinho pelo webhook e pelo cron
-- sync-ghl-opportunities. Até aqui o Stage 2 só era marcado pelo PATCH manual
-- e estava vazio na base. Esta função faz o WON marcar o Stage 2.
--
-- REGRA (uma call por contato):
--   - Alvo: a call mais recente do contato com is_sales_call = true; se não
--     houver, a mais recente de todas. "Mais recente" = call_date, desempate
--     por created_at.
--   - Só marca se o alvo tem stage2_outcome IS NULL. Marcação manual
--     (paying/not_paying/pending) é soberana e não é sobrescrita.
--   - Não marca se QUALQUER call do contato já é 'paying'.
--   - became_paying_at = ghl_won_at do alvo (coalesce now()). Como o WHERE
--     exige stage2_outcome IS NULL, só a primeira marcação grava a data;
--     syncs seguintes não casam nenhuma linha.
--   - Grava a trilha em calls_data_corrections na mesma instrução.
--
-- Concorrência (webhook e cron ao mesmo tempo): os dois escolhem o mesmo
-- alvo; o segundo UPDATE reavalia stage2_outcome IS NULL depois do lock da
-- linha e não casa nada.
--
-- Chamada por dbUpdateGhlOpportunity (lib/db/calls.ts) quando status = 'won',
-- com o client service_role. Retorna o id da call marcada, ou NULL.
--
-- DEPENDE DE: 116a (calls_data_corrections). A função é LANGUAGE sql, então o
-- corpo é validado no CREATE — sem a tabela, a 117 falha.
--
-- DEPLOY: 117 → 118 (backfill) → código que chama .rpc(). O código antes da
-- 118 faria o cron marcar os won antigos com a data errada (ver 118).
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_stage2_paying_from_won(
  p_org_id     uuid,
  p_contact_id text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.mark_stage2_paying_from_won(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stage2_paying_from_won(uuid, text) TO service_role;

COMMENT ON FUNCTION public.mark_stage2_paying_from_won(uuid, text) IS
  'GHL Won → Stage 2 paying numa call do contato (a de venda mais recente). Só se stage2_outcome IS NULL e nenhuma call do contato já for paying. Trilha em calls_data_corrections (applied_by = ghl_won_sync).';

-- ── Rollback ────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.mark_stage2_paying_from_won(uuid, text);
