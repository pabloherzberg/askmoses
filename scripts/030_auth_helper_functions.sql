-- ============================================================
-- 030_auth_helper_functions.sql
-- Funções SQL chamadas via supabase.rpc() pelo lib/auth.ts.
-- Substituem 3-4 SELECTs separados (users → memberships →
-- organizations → clients → plans) por um único round trip.
--
-- Todas SECURITY DEFINER (precisam ler users + memberships sem
-- bater nas políticas RLS); STABLE (mesma input → mesma saída
-- dentro de uma transação).
-- ============================================================

-- ─── 1. get_user_org_context — bootstrap de auth por request ─────────────────
-- Retorna o estado completo da org ativa do user: org_id, role no membership,
-- e os campos do plano (code, has_rag, limites). NULL em qualquer campo
-- significa "não definido" (ex.: user sem active_org_id ainda, ou plano sem
-- limite ⇒ ilimitado).

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',      u.active_org_id,
    'role',             m.role,
    'planCode',         p.code,
    'hasRag',           COALESCE(p.has_rag, false),
    'maxSalesPeople',   p.max_sales_people,
    'maxCallsPerMonth', p.max_calls_per_month
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

-- ─── 2. get_memberships_for_switcher — alimenta o seletor de org ─────────────
-- Lista todas as orgs onde o user tem membership aceita, com nome da org e
-- role naquela org. Ordenada por nome.

CREATE OR REPLACE FUNCTION public.get_memberships_for_switcher(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'orgId',   o.id,
        'orgName', o.name,
        'role',    m.role
      )
      ORDER BY o.name
    ),
    '[]'::jsonb
  )
  FROM      public.memberships   m
  JOIN      public.organizations o ON o.id = m.org_id
  WHERE     m.user_id       = p_user_id
    AND     m.invite_status = 'accepted'
$$;
