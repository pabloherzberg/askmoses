-- ============================================================
-- 094_appointments.sql
--
-- Agenda do GHL ingerida para a VISÃO DO OWNER "quem está agendado pra hoje".
-- O owner abre o módulo Intent Analysis e vê quem tem agendamento hoje + o
-- intent de cada lead, pra mandar o time focar em quem não pode esfriar.
--
-- ⚠️ Isto é o "one" do GHL (AGENDAMENTO — Melinda agendou Jamila), NÃO o paying
-- client (Stage 2, que vive em calls.stage2_outcome).
--
-- Linkagem ao intent: appointments.contact_id ↔ calls.contact_id (migration
-- 091) → pega o último intent conhecido do contato.
--
-- Ingestão: webhook GHL (evento de agendamento) faz upsert idempotente por
-- ghl_appointment_id. Ver lib/db/appointments.ts.
--
-- Idempotente: CREATE TABLE / INDEX IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- ID do agendamento no GHL — chave de idempotência (um upsert por agendamento).
  ghl_appointment_id TEXT NOT NULL,
  contact_id TEXT,
  contact_name TEXT,
  -- Trainer responsável (quando resolúvel). Nullable: agendamento pode chegar
  -- sem usuário GHL mapeado a um trainer da plataforma.
  trainer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  trainer_name TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  -- Status do agendamento no GHL: booked | confirmed | cancelled | showed | noshow...
  status TEXT,
  ghl_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência da ingestão por org+agendamento.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_org_ghl_id_uidx
  ON public.appointments(org_id, ghl_appointment_id);

-- Consulta "agendados hoje" por org, ordenada por horário.
CREATE INDEX IF NOT EXISTS appointments_org_scheduled_idx
  ON public.appointments(org_id, scheduled_at);

-- Join ao intent do lead via contato.
CREATE INDEX IF NOT EXISTS appointments_org_contact_idx
  ON public.appointments(org_id, contact_id)
  WHERE contact_id IS NOT NULL;

COMMENT ON TABLE public.appointments IS
  'Agendamentos ingeridos da agenda GHL (o "one"/agendamento, NÃO paying '
  'client). Alimenta a visão "agendados hoje" do owner em Intent Analysis.';

COMMENT ON COLUMN public.appointments.ghl_appointment_id IS
  'ID do agendamento no GHL — chave de idempotência da ingestão.';
