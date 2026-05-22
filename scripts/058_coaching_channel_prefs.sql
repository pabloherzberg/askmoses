-- ============================================================
-- 058_coaching_channel_prefs.sql
--
-- Preferências de canal de coaching por trainer. O trainer escolhe em
-- /me/settings quais canais mantém ativos para receber recomendações:
--   in_app → recomendação aparece no sino do header
--   email  → recomendação é enviada por email (lib/email/coaching-rec-template)
--
-- Quando o Owner envia uma recomendação (POST /api/coaching/notifications),
-- a entrega faz fan-out apenas para os canais ativos do trainer destinatário.
--
-- Ausência de linha = ambos os canais ativos (default). Um trainer que nunca
-- abriu /me/settings continua recebendo tudo — comportamento idêntico ao
-- anterior à migration 058.
--
-- Invariante: pelo menos um canal sempre ativo (CHECK in_app OR email). O
-- trainer não pode se tornar incontactável — o Owner sempre tem por onde
-- entregar a recomendação. Garantido também na API e na UI.
--
-- Acesso só via service role (RLS on, sem policies) — mesmo padrão de
-- coaching_notifications (057). O scoping por trainer é feito na aplicação.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coaching_channel_prefs (
  trainer_id  UUID PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  in_app      BOOLEAN NOT NULL DEFAULT true,
  email       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Pelo menos um canal precisa ficar ativo — senão o Owner não teria como
  -- entregar a recomendação ao trainer.
  CONSTRAINT coaching_channel_prefs_at_least_one CHECK (in_app OR email)
);

COMMENT ON TABLE public.coaching_channel_prefs IS
  'Preferências de canal (in-app / email) por trainer para recomendações de coaching. Ausência de linha = ambos os canais ativos.';

-- RLS on, sem policies → bloqueado pra anon/auth keys; só service role acessa.
ALTER TABLE public.coaching_channel_prefs ENABLE ROW LEVEL SECURITY;
