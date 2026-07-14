-- ============================================================
-- 102_backfill_calls_contact_id.sql
--
-- Backfill de calls.contact_id para linhas gravadas depois da migration 091.
--
-- Causa raiz: dbUpsertGhlCall (lib/db/calls.ts) nunca gravava contact_id no
-- insert — só a migration 091 fez um backfill único na criação da coluna.
-- Toda call ingerida pelo webhook GHL desde então ficou com contact_id NULL,
-- o que quebra dbUpdateGhlOpportunity (handler OpportunityStageChanged em
-- app/api/webhooks/ghl/route.ts): o UPDATE ... WHERE contact_id = ? nunca
-- encontra a linha, então ghl_won_status nunca é preenchido. Corrigido no
-- código para gravar contact_id em todo insert novo; este script recupera
-- as calls já gravadas sem ele.
--
-- Idempotente: só atualiza linhas com contact_id ainda NULL.
-- ============================================================

UPDATE public.calls
SET contact_id = ghl_payload->'customData'->>'contactId'
WHERE contact_id IS NULL
  AND ghl_payload->'customData'->>'contactId' IS NOT NULL;
