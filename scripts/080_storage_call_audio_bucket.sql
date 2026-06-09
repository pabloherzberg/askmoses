-- ============================================================
-- 080_storage_call_audio_bucket.sql
--
-- Bucket privado `call-audio` — armazenamento TRANSITÓRIO dos chunks de
-- áudio enquanto eles trafegam pela fila (077). Cada arquivo é deletado
-- assim que o chunk correspondente é transcrito; nada de áudio fica
-- guardado em regime permanente.
--
-- Layout de paths:
--   call-audio/chunks/<call_id>/<chunk_index>.mp3
--
-- Privado (public = false): todo acesso é server-side via service role
-- (cron e rotas internas usam admin client, que bypassa RLS de Storage).
-- O upload do áudio original no fluxo manual usa signed upload URL gerada
-- server-side — também não depende de policy de usuário. Por isso NÃO
-- criamos policies em storage.objects: ninguém além do service role toca
-- neste bucket.
--
-- Idempotente — ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('call-audio', 'call-audio', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- Esvaziar o bucket antes (Storage não deixa dropar bucket com objetos):
--   DELETE FROM storage.objects WHERE bucket_id = 'call-audio';
--   DELETE FROM storage.buckets WHERE id = 'call-audio';
