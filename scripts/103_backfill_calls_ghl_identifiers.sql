-- ============================================================
-- 103_backfill_calls_ghl_identifiers.sql
--
-- Repara as calls ingeridas pelo webhook do GHL que nasceram com
-- contact_id e ghl_user_id NULL.
--
-- CAUSA RAIZ: o INSERT de dbUpsertGhlCall (lib/db/calls.ts) não gravava
-- contact_id, e o webhook (app/api/webhooks/ghl/route.ts) não passava
-- ghlUserId. As colunas existiam (migrations 091 e 096) mas nenhum caminho
-- de escrita as preenchia — toda call nova entrava com as duas NULL.
--
-- Consequências que este backfill destrava:
--   • dbUpdateGhlOpportunity faz UPDATE ... WHERE contact_id = $1 → com a
--     coluna NULL, o webhook de oportunidade casava 0 linhas e ghl_won_status
--     /ghl_won_at/ghl_opportunity_id nunca eram marcados (Stage 2 / paying
--     client silenciosamente morto).
--   • O join de intent entre appointments e calls (lib/services/appointments.ts)
--     é por contact_id → a coluna "intent" da visão "agendados hoje" vinha null.
--   • dbGetUnlinkedCallsByGhlUser filtra por ghl_user_id.
--
-- Os valores são recuperáveis: o webhook sempre persistiu o rawBody inteiro em
-- ghl_payload, e os campos da call vivem em ghl_payload->'customData'.
--
-- ATENÇÃO: este backfill NÃO reconstrói o ghl_won_status das oportunidades cujo
-- webhook já chegou e foi descartado — esses eventos se perderam. Ele apenas
-- garante que os PRÓXIMOS casem. Se precisar do histórico de won, será preciso
-- reconciliar contra a API do GHL.
--
-- Idempotente: só toca linhas com a coluna ainda NULL.
-- ============================================================

BEGIN;

UPDATE public.calls
SET contact_id = NULLIF(TRIM(ghl_payload->'customData'->>'contactId'), '')
WHERE contact_id IS NULL
  AND NULLIF(TRIM(ghl_payload->'customData'->>'contactId'), '') IS NOT NULL;

UPDATE public.calls
SET ghl_user_id = NULLIF(TRIM(ghl_payload->'customData'->>'userId'), '')
WHERE ghl_user_id IS NULL
  AND NULLIF(TRIM(ghl_payload->'customData'->>'userId'), '') IS NOT NULL;

COMMIT;

-- Conferência (rodar depois do COMMIT):
--   SELECT COUNT(*) FILTER (WHERE contact_id IS NULL)  AS sem_contact_id,
--          COUNT(*) FILTER (WHERE ghl_user_id IS NULL) AS sem_ghl_user_id,
--          COUNT(*)                                    AS total_ghl
--   FROM public.calls
--   WHERE ingest_source = 'ghl';
