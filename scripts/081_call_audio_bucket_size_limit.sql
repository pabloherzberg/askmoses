-- ============================================================
-- 081_call_audio_bucket_size_limit.sql
--
-- Sobe o teto de tamanho do bucket `call-audio` (criado na 080) de 50MB
-- (default global do projeto) para 500MB.
--
-- Contexto: o upload manual de áudio vai DIRETO do browser pro Storage via
-- signed URL (app/api/calls/create-upload). Quando `file_size_limit` é NULL,
-- o bucket herda o limite global do projeto — que no Supabase ficava em 50MB
-- e barrava calls grandes (ex.: áudio de 5h ≈ 290–430MB em MP3) ANTES de o
-- pipeline de chunks (077-080) sequer rodar.
--
-- 500MB = 500 * 1024 * 1024 = 524288000 bytes.
--
-- ⚠️ PRÉ-REQUISITO MANUAL (não dá pra fazer via SQL):
--   O `file_size_limit` por-bucket NUNCA pode exceder o limite GLOBAL do
--   projeto. É preciso subir o global no dashboard antes/junto:
--     Supabase Dashboard → Storage → Settings → "Upload file size limit"
--     → definir >= 500 MB.
--   Requer plano Pro+ (no Free o teto global é fixo em 50MB). O projeto está
--   no Pro, então é só ajustar a config.
--
-- Mantém o front (MAX_UPLOAD_MB = 500 em UploadCallClient.tsx) alinhado a
-- este limite.
--
-- Idempotente — UPDATE direto por id.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 524288000  -- 500 MB
WHERE id = 'call-audio';

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- Voltar ao default herdado do projeto:
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'call-audio';
