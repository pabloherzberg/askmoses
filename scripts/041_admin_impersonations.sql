-- ============================================================
-- 041_admin_impersonations.sql
-- Audit log do Admin impersonate (decisão Victor 2026-05-13, Q3 +
-- Q4). Cada vez que Ariel "entra" numa org via painel admin, vira
-- uma row aqui — desbloqueia auditoria futura ("quem viu o quê") e
-- atende compliance de Centurion/TtL caso peçam.
--
-- Schema mínimo: quem (admin_user_id), onde (target_org_id), quando
-- (started_at, ended_at). Sessão "aberta" = ended_at NULL. Mais de
-- uma row aberta por (admin, org) é OK — abas distintas, sessões
-- expiradas sem clear, etc. O exit endpoint fecha apenas a mais
-- recente ainda aberta dessa dupla.
--
-- FKs:
--   admin_user_id ON DELETE SET NULL — admin removido do sistema
--     não apaga histórico (mantém o registro com NULL).
--   target_org_id ON DELETE SET NULL — mesmo critério caso a org
--     seja deletada no futuro.
--
-- Lockdown total: RLS + FORCE + REVOKE/GRANT só service_role.
-- Apenas /api/admin/impersonate (createAdminClient) escreve aqui.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────

-- Minimização: gravamos só o essencial pra audit (quem, onde, quando).
-- IP/UA omitidos por princípio LGPD de minimização — adicionar depois se
-- Centurion/TtL pedirem audit formal com retenção definida + ToS atualizado.
CREATE TABLE IF NOT EXISTS public.admin_impersonations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID REFERENCES public.users(id)         ON DELETE SET NULL,
  target_org_id   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  CONSTRAINT admin_impersonations_lifecycle_chk
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- ─── 2. Índices ──────────────────────────────────────────────────────────────

-- Lookup principal: "quais sessões abertas tem esse admin agora?"
-- Partial index — sessões fechadas (ended_at NOT NULL) são minoria do read traffic.
CREATE INDEX IF NOT EXISTS admin_impersonations_active_idx
  ON public.admin_impersonations(admin_user_id, started_at DESC)
  WHERE ended_at IS NULL;

-- Auditoria por org: "quem acessou Centurion no último mês?"
CREATE INDEX IF NOT EXISTS admin_impersonations_org_idx
  ON public.admin_impersonations(target_org_id, started_at DESC);

-- Auditoria global por período (compliance reports)
CREATE INDEX IF NOT EXISTS admin_impersonations_started_at_idx
  ON public.admin_impersonations(started_at DESC);

-- ─── 3. RLS lockdown total ──────────────────────────────────────────────────
-- Audit log nunca legível pelo cliente. Mesmo padrão de invite_tokens (034):
-- RLS + FORCE + sem policies pra anon/authenticated.

ALTER TABLE public.admin_impersonations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_impersonations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_impersonations FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.admin_impersonations TO   service_role;

-- ─── 4. Helper: encerra a sessão ativa mais recente de (admin, org) ─────────
-- Usado pelo DELETE /api/admin/impersonate. Atomic: marca ended_at na linha
-- mais recente ainda aberta dessa dupla (admin_user_id, target_org_id).
-- Se nenhuma estiver aberta, retorna NULL (no-op idempotente).
--
-- SECURITY DEFINER pra rodar com privilégios da função; só service_role chama.

CREATE OR REPLACE FUNCTION public.close_admin_impersonation(
  p_admin_user_id UUID,
  p_target_org_id UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admin_impersonations
     SET ended_at = now()
   WHERE id = (
     SELECT id
     FROM   public.admin_impersonations
     WHERE  admin_user_id = p_admin_user_id
       AND  target_org_id = p_target_org_id
       AND  ended_at      IS NULL
     ORDER BY started_at DESC
     LIMIT 1
   )
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  TO   service_role;

-- ─── 5. Comentários ──────────────────────────────────────────────────────────

COMMENT ON TABLE  public.admin_impersonations IS
  'Audit log de Admin entrando em orgs via impersonate. Uma row por sessão (start = clicar org no painel, end = clicar "voltar ao painel admin" ou logout). Nunca exposto pra client — leitura via createAdminClient only.';

COMMENT ON COLUMN public.admin_impersonations.ended_at IS
  'NULL = sessão ainda aberta. Set por close_admin_impersonation() ou job de cleanup que fecha sessões >24h.';
