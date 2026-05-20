-- ============================================================
-- 044_calls_ghl_integration.sql
--
-- Adiciona o schema necessário para ingerir calls vindas do
-- webhook do GoHighLevel (Pepper CRM) e armazenar o transcript
-- gerado por Whisper. Não inclui campos de scoring — esse pipeline
-- (analyze, coaching email) consome estes registros depois,
-- filtrando por processing_status = 'transcribed'.
--
-- Campos:
--   external_call_id   — hash determinístico do payload do GHL para
--                        garantir idempotência (vide buildExternalCallId
--                        em lib/services/ghl-helpers.ts)
--   recording_url      — URL original do áudio no GHL (efêmera; áudio
--                        não é armazenado do nosso lado, só transcrito
--                        em memória)
--   transcript_source  — origem do transcript: 'whisper' (Whisper API),
--                        'manual' (colado/upload), 'ghl' (caso voltemos
--                        a confiar no transcript nativo do GHL no futuro)
--   processing_status  — estado do pipeline assíncrono disparado pelo
--                        webhook. 'transcribed' é o estado terminal
--                        feliz e é o ponto de fanout para features
--                        posteriores (scoring, email).
--   ingest_source      — como a call chegou no sistema. 'manual' para
--                        uploads via /dashboard/upload, 'ghl' para
--                        webhook.
--   ghl_payload        — JSONB com o payload bruto do webhook,
--                        preservado para debug, replay e para que
--                        features futuras extraiam campos sem precisar
--                        de nova migration.
--
-- organizations.ghl_location_id — mapping 1:1 entre uma org AskMoses
--                        e uma location no GHL (regra GHL-15 do doc).
--                        Hoje só temos uma org; mantém o lookup
--                        funcional para multi-tenant futuro.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Campos novos em calls ────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS external_call_id  TEXT,
  ADD COLUMN IF NOT EXISTS recording_url     TEXT,
  ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ingest_source     TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ghl_payload       JSONB;

-- ─── 2. CHECK constraints (idempotentes) ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_transcript_source_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_transcript_source_check
      CHECK (transcript_source IS NULL
        OR transcript_source IN ('whisper', 'manual', 'ghl'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_processing_status_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_processing_status_check
      CHECK (processing_status IN (
        'pending', 'processing', 'transcribed',
        'no_recording', 'transcription_failed', 'webhook_failed'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_ingest_source_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_ingest_source_check
      CHECK (ingest_source IN ('manual', 'ghl'));
  END IF;
END$$;

-- ─── 3. Idempotência: external_call_id único (parcial) ──────────────────────

-- Parcial porque calls antigas (ingest_source='manual') não têm
-- external_call_id e não precisam dele.
CREATE UNIQUE INDEX IF NOT EXISTS calls_external_call_id_unique_idx
  ON public.calls(external_call_id)
  WHERE external_call_id IS NOT NULL;

-- Índice de status para o consumer downstream (scoring) filtrar
-- rapidamente as calls transcritas e ainda não processadas.
CREATE INDEX IF NOT EXISTS calls_processing_status_idx
  ON public.calls(processing_status)
  WHERE processing_status IN ('transcribed', 'pending', 'processing');

-- ─── 4. organizations.ghl_location_id ────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_ghl_location_id_unique_idx
  ON public.organizations(ghl_location_id)
  WHERE ghl_location_id IS NOT NULL;

-- Backfill: associa a location atual ('l2VVQax2pxKTUZWYYsW0') à org
-- default do Ariel (Centurion/Taking). Só executa se a coluna ainda
-- não foi preenchida e se a org existir com esse nome.
UPDATE public.organizations
   SET ghl_location_id = 'l2VVQax2pxKTUZWYYsW0'
 WHERE ghl_location_id IS NULL
   AND (name ILIKE '%centurion%' OR name ILIKE '%taking%');

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.calls_external_call_id_unique_idx;
-- DROP INDEX IF EXISTS public.calls_processing_status_idx;
-- DROP INDEX IF EXISTS public.organizations_ghl_location_id_unique_idx;
-- ALTER TABLE public.calls
--   DROP CONSTRAINT IF EXISTS calls_transcript_source_check,
--   DROP CONSTRAINT IF EXISTS calls_processing_status_check,
--   DROP CONSTRAINT IF EXISTS calls_ingest_source_check;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS external_call_id,
--   DROP COLUMN IF EXISTS recording_url,
--   DROP COLUMN IF EXISTS transcript_source,
--   DROP COLUMN IF EXISTS processing_status,
--   DROP COLUMN IF EXISTS ingest_source,
--   DROP COLUMN IF EXISTS ghl_payload;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS ghl_location_id;
