-- ============================================================
-- 092_calls_stage2.sql
--
-- Os DOIS ESTÁGIOS do funil (não confundir success com intent):
--   Stage 1 — Initial Result: sucesso = agendar o intro offer. Já existe como
--             calls.call_outcome (closed/partial/not_closed/no_outcome). Só
--             muda o RÓTULO na UI ("Initial Result") — sem alteração de schema.
--   Stage 2 — Actual Close: sucesso = paying client (pagou o pacote). NOVO.
--
-- ⚠️ O "one" do GHL (agendamento) NÃO é o paying client. Stage 2 é marcação
-- separada (manual nesta fase; automação fica para depois).
--
-- Colunas novas em calls:
--   stage2_outcome   — paying | not_paying | pending (NULL = ainda não avaliado)
--   became_paying_at — quando virou pagante
--   intent_at_close  — SNAPSHOT do Intent Index previsto no momento em que vira
--                      pagante. Comporta o LOOP DE APRENDIZADO futuro (intent
--                      previsto × fechou de fato). Só persistência, sem treino.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CHECK guardado por DO-block.
-- ============================================================

BEGIN;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS stage2_outcome TEXT;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS became_paying_at TIMESTAMPTZ;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS intent_at_close NUMERIC(3,2);

-- Domínio de stage2_outcome.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_stage2_outcome_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_stage2_outcome_check
      CHECK (stage2_outcome IS NULL OR stage2_outcome IN ('paying', 'not_paying', 'pending'));
  END IF;
END $$;

COMMENT ON COLUMN public.calls.stage2_outcome IS
  'Stage 2 (Actual Close): paying | not_paying | pending. NULL = não avaliado. '
  'Marcação manual nesta fase; separado do agendamento GHL (Stage 1).';

COMMENT ON COLUMN public.calls.became_paying_at IS
  'Timestamp em que o lead virou paying client (Stage 2).';

COMMENT ON COLUMN public.calls.intent_at_close IS
  'Snapshot do Intent Index 0–5 previsto quando o Stage 2 foi marcado. '
  'Reservado para o loop de aprendizado (intent previsto × fechou de fato).';

COMMIT;
