-- ============================================================
-- 110_call_chunks_transcript_quality.sql
--
-- Instrumentação do guard de saída degenerada do Whisper
-- (lib/services/whisper.ts, isDegenerateTranscript).
--
-- CONTEXTO: entre 18/06 e 19/09/2026, 30 calls ficaram com a transcrição
-- substituída pelo prompt do Whisper repetido dezenas de vezes. O `prompt` da
-- API não é instrução, é condicionamento; sem fala competindo no áudio, a
-- continuação mais provável daqueles tokens é o próprio prompt. A API devolve
-- 200 com texto bem formado, então nada no pipeline percebia.
--
-- A causa foi removida (não enviamos mais prompt por padrão) e entrou um guard
-- que mede a razão de SENTENÇAS únicas e descarta o chunk abaixo do corte.
--
-- POR QUE ESTAS COLUNAS: o limiar (DEGENERATE_SENTENCE_RATIO = 0.3) é
-- PROVISÓRIO. Não foi possível calibrá-lo com dados reais porque
-- `call_chunks.transcript` é zerado após a costura (dbClearChunkPayloads), e a
-- medição sobre o transcript CONSOLIDADO não separa as populações — uma call
-- longa com um chunk ruim tem conversa real diluindo a razão (medido:
-- normal com 0,002 e corrompida com 0,976 se sobrepõem).
--
--   transcript_ratio    — gravada em TODO chunk, rejeitado ou não. Sem a
--                         distribuição dos que PASSAM não há como recalibrar
--                         sem viés: só se saberia dos que caíram abaixo do
--                         corte, que é a amostra enviesada de sempre.
--   rejected_transcript — o texto cru do chunk rejeitado. É a evidência de que
--                         a detecção funcionou e o que permite conferir falso
--                         positivo.
--
-- Nenhuma das duas é tocada por dbClearChunkPayloads (que zera apenas
-- transcript e storage_path), então sobrevivem à consolidação de propósito.
--
-- Não mexe em `status`: a alternativa de criar um status 'rejected' tocaria o
-- CHECK da 077, o tipo ChunkStatus, a contabilidade de conclusão
-- (dbGetChunkStatusCounts decide quando a call consolida), o stitcher e o
-- clear. Instrumentação não deve mexer em contabilidade de conclusão, que tem
-- claim atômico e stale-reclaim. Chunk rejeitado continua 'done' com
-- transcript vazio — o stitcher já descarta vazio.
--
-- CALIBRAÇÃO (rodar daqui a ~2 semanas, com volume acumulado):
--
--   SELECT
--     round(percentile_cont(0.05) WITHIN GROUP (ORDER BY transcript_ratio)::numeric, 3) AS p05_saudavel,
--     round(percentile_cont(0.50) WITHIN GROUP (ORDER BY transcript_ratio)::numeric, 3) AS mediana,
--     count(*) AS chunks
--   FROM public.call_chunks
--   WHERE transcript_ratio IS NOT NULL AND rejected_transcript IS NULL;
--
-- Se o p05 dos saudáveis ficar bem acima de 0,3 (ex.: 0,8), dá pra subir o
-- corte com segurança. O vale entre as duas populações é o alvo.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.call_chunks
  ADD COLUMN IF NOT EXISTS transcript_ratio    NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS rejected_transcript TEXT;

COMMENT ON COLUMN public.call_chunks.transcript_ratio IS
  'Razão de sentenças únicas / total do que o Whisper devolveu neste chunk '
  '(lib/services/whisper.ts degenerateStats). Gravada em TODO chunk, rejeitado '
  'ou não — é a amostra não-enviesada para recalibrar '
  'DEGENERATE_SENTENCE_RATIO. NULL em chunk anterior à migration 110.';

COMMENT ON COLUMN public.call_chunks.rejected_transcript IS
  'Texto cru do chunk descartado pelo guard de saída degenerada. Evidência '
  'para conferir falso positivo. NULL quando o chunk passou. Sobrevive ao '
  'dbClearChunkPayloads de propósito.';

-- Suporte à query de calibração (varre só o que tem medida).
CREATE INDEX IF NOT EXISTS call_chunks_transcript_ratio_idx
  ON public.call_chunks (transcript_ratio)
  WHERE transcript_ratio IS NOT NULL;

-- Rollback (manual):
--   DROP INDEX IF EXISTS public.call_chunks_transcript_ratio_idx;
--   ALTER TABLE public.call_chunks
--     DROP COLUMN IF EXISTS transcript_ratio,
--     DROP COLUMN IF EXISTS rejected_transcript;
