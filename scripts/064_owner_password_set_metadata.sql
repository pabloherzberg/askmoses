-- 064: Backfill app_metadata.password_set=true para usuários com senha já definida.
--
-- Contexto: o middleware passou a redirecionar owners sem app_metadata.password_set=true
-- pra /password?welcome=1&forced=1. Owners pré-existentes que já têm senha gravada em
-- auth.users.encrypted_password também precisam do flag, senão são pegos pelo gate.
--
-- Critério: encrypted_password IS NOT NULL → o user definiu senha em algum momento.
-- Update is idempotent: só seta o flag onde ainda não existe, preservando outras keys
-- em raw_app_meta_data.
--
-- Rodar manualmente via Supabase SQL editor após deploy do middleware.

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"password_set": true}'::jsonb
WHERE encrypted_password IS NOT NULL
  AND (raw_app_meta_data->>'password_set') IS DISTINCT FROM 'true';
