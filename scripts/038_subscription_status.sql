-- ============================================================
-- 037_subscription_status.sql
-- Adiciona clients.subscription_status pra suportar self-service
-- onboarding: Owner cria org com sub 'inactive' (sem plano efetivo),
-- vira 'active' após checkout (Stripe ou stub). Plan gate frontend
-- usa esse campo pra renderizar UpsellBadge/FeatureGate; backend
-- usa em requireActiveSubscription() pra retornar 402.
--
-- Padrão TEXT + CHECK seguindo o resto do schema (027, 020, 013, 018)
-- em vez de ENUM real — facilita evoluir valores no futuro
-- (ex.: 'trialing', 'past_due', 'canceled') sem ALTER TYPE.
-- ============================================================

-- ─── 1. Coluna em clients ────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active'));

CREATE INDEX IF NOT EXISTS clients_subscription_status_idx
  ON public.clients(subscription_status);

-- ─── 2. Backfill: orgs existentes (criadas via Admin) viram 'active' ─────────
-- Premissa: tudo que já está no banco hoje é cliente real criado por Admin,
-- portanto considerado ativo. O caminho self-service (nova rota
-- /api/onboarding/organization) é o único que cria com 'inactive' daqui em
-- diante. Só backfilla quem tem plan_id — sem plano não existe sub ativa.

UPDATE public.clients
SET    subscription_status = 'active'
WHERE  plan_id IS NOT NULL
  AND  subscription_status = 'inactive';

-- ─── 3. Atualizar get_user_org_context pra retornar subscriptionStatus ───────
-- lib/auth.ts ActiveOrgContext ganha o campo correspondente. COALESCE garante
-- que user sem org ativa (ainda em onboarding) recebe 'inactive' — UI trata
-- igual ao caso "tem org mas não pagou".

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',        u.active_org_id,
    'role',               m.role,
    'planCode',           p.code,
    'hasRag',             COALESCE(p.has_rag, false),
    'maxSalesPeople',     p.max_sales_people,
    'maxCallsPerMonth',   p.max_calls_per_month,
    'subscriptionStatus', COALESCE(c.subscription_status, 'inactive')
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.clients       c ON c.id            = o.client_id
  LEFT JOIN  public.plans         p ON p.id            = c.plan_id
  WHERE      u.id = p_user_id
$$;
