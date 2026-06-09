-- ============================================================
-- 077_call_chunks.sql
--
-- Fila de transcrição por chunks. Calls grandes (> limite de 25MB do
-- Whisper) são cortadas em pedaços menores no ingest e enfileiradas aqui;
-- o worker (Vercel Cron · /api/cron/process-chunks) drena a fila chunk a
-- chunk, transcreve cada um e remonta o transcript no final.
--
-- Por que tabela própria (e não inline na call):
--   - Retomada parcial: se uma função serverless morre no meio, o cron
--     pega só os chunks que faltam — não refaz a call inteira.
--   - Idempotência e indexação: UNIQUE (call_id, chunk_index) garante que
--     cada pedaço entra uma vez; o status por linha é a fonte de verdade
--     do progresso.
--
-- Áudio é TRANSITÓRIO: o arquivo de cada chunk vive no Storage (bucket
-- privado `call-audio`) só até ser transcrito, e é deletado na hora. A
-- linha aqui permanece como índice/auditoria leve (status + janela de
-- tempo), com `transcript` e `storage_path` zerados após a consolidação.
-- O único artefato durável é calls.transcript.
--
-- Campos:
--   chunk_index   — ordem do pedaço dentro da call (0-based).
--   start_ms/end_ms — janela de tempo (em ms) do pedaço no áudio original.
--                   Inclui o overlap; usado pela consolidação pra costurar.
--   overlap_ms    — quanto este chunk sobrepõe o anterior (dedup na costura).
--   storage_path  — path do arquivo no bucket `call-audio`. NULL após delete.
--   status        — pending | processing | done | failed.
--   transcript    — texto parcial transcrito deste chunk. NULL até done e
--                   zerado de novo após a consolidação (auditoria leve).
--   attempts      — nº de tentativas; o worker desiste em failed após o teto.
--   transcription_cost_usd — custo Whisper deste chunk (somado na call).
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_chunks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  org_id                 UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  chunk_index            INT  NOT NULL,
  start_ms               INT,
  end_ms                 INT,
  overlap_ms             INT  NOT NULL DEFAULT 0,
  storage_path           TEXT,
  mime_type              TEXT NOT NULL DEFAULT 'audio/mpeg',
  status                 TEXT NOT NULL DEFAULT 'pending',
  transcript             TEXT,
  attempts               INT  NOT NULL DEFAULT 0,
  last_error             TEXT,
  transcription_cost_usd NUMERIC(10, 6),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_id, chunk_index)
);

-- ─── 2. CHECK de status (idempotente) ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'call_chunks_status_check'
      AND conrelid = 'public.call_chunks'::regclass
  ) THEN
    ALTER TABLE public.call_chunks
      ADD CONSTRAINT call_chunks_status_check
      CHECK (status IN ('pending', 'processing', 'done', 'failed'));
  END IF;
END$$;

-- ─── 3. Índices ──────────────────────────────────────────────────────────────

-- Fila: o worker varre pending (e processing stale) por ordem de chegada.
CREATE INDEX IF NOT EXISTS call_chunks_queue_idx
  ON public.call_chunks(status, created_at)
  WHERE status IN ('pending', 'processing');

-- Consolidação e progresso: todos os chunks de uma call, em ordem.
CREATE INDEX IF NOT EXISTS call_chunks_call_id_idx
  ON public.call_chunks(call_id, chunk_index);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
-- Mesmo padrão de script_intelligence_cache (057): service_role faz tudo
-- (API routes / cron usam admin client), org só lê os próprios via JWT.

ALTER TABLE public.call_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_chunks'
      AND policyname = 'call_chunks_service_role'
  ) THEN
    CREATE POLICY "call_chunks_service_role" ON public.call_chunks
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_chunks'
      AND policyname = 'call_chunks_select_org'
  ) THEN
    CREATE POLICY "call_chunks_select_org" ON public.call_chunks
      FOR SELECT
      USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
  END IF;
END$$;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.call_chunks;
