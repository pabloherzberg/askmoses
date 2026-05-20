-- ============================================================
-- 057_coaching_notifications.sql
--
-- Notificações de coaching: quando o Owner envia uma recomendação no
-- Team Command Center (AI Coaching Recommendations → Revisar e enviar),
-- o sales person recebe uma notificação no sino do header.
--
-- Acesso só via service role (RLS on, sem policies) — mesmo padrão de
-- org_scripts (migration 044). Os endpoints em /api/coaching/notifications
-- usam createAdminClient e fazem o scoping por org/trainer na aplicação.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coaching_notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Trainer destinatário. Resolvido no envio pelo nome (via calls.trainer_name,
  -- consistente com os nomes da tela de coaching). Nullable: se o nome não
  -- casar com nenhum trainer, a notificação ainda é gravada com recipient_name.
  recipient_trainer_id UUID REFERENCES public.trainers(id) ON DELETE CASCADE,
  recipient_name       TEXT NOT NULL,
  -- Quem enviou (Owner). sent_by_name é denormalizado pra exibição.
  sent_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_name         TEXT NOT NULL,
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'unread'
                         CHECK (status IN ('unread', 'read')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at              TIMESTAMPTZ
);

COMMENT ON TABLE public.coaching_notifications IS
  'Recomendações de coaching enviadas pelo Owner ao sales person, lidas no sino do header do trainer.';

CREATE INDEX IF NOT EXISTS idx_coaching_notifications_recipient
  ON public.coaching_notifications(recipient_trainer_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_notifications_org
  ON public.coaching_notifications(org_id);

-- RLS on, sem policies → bloqueado pra anon/auth keys; só service role acessa.
ALTER TABLE public.coaching_notifications ENABLE ROW LEVEL SECURITY;
