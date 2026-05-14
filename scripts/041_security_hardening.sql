-- ============================================================
-- 046_security_hardening.sql
-- Hardening pós code-review (2026-05-13). Cobre 3 itens:
--
--   1. api_rate_limits — tabela + check_rate_limit() RPC pra rate limit
--      de endpoints sensíveis (/api/me/password e demais state-changing).
--      Não substitui o rate limit do Supabase Auth — adiciona camada
--      controlada pela app (custom por endpoint, sem depender de feature flag).
--
--   2. clear_stale_active_org() — trigger AFTER DELETE em memberships
--      que zera users.active_org_id quando a membership da org ativa
--      é removida. Fecha janela de exposição entre remoção da membership
--      e refresh do JWT (~1h default Supabase).
--
--   3. expire_trials() — função callable via cron (pg_cron, Vercel Cron
--      ou Supabase Edge Function). Flippa subscription_status pra 'inactive'
--      onde trial_ends_at já passou. get_user_org_context já flippa on-read
--      em 040, mas o estado físico no DB ficava stale — Admin panel
--      mostrava "Trial" pra orgs efetivamente bloqueadas.
--
-- Idempotente.
-- ============================================================

-- ─── 1. Rate limit table + check function ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key          TEXT PRIMARY KEY,
  hits         INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TTL: rows expiradas são limpas no próximo check do mesmo key. Sem
-- janela de inatividade prolongada (key não-visitado), uma row pode
-- ficar pendurada — job de cleanup futuro pode dropar rows com
-- window_start < now() - interval '1 day' se quiser limpeza agressiva.
CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx
  ON public.api_rate_limits(window_start);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.api_rate_limits TO   service_role;

-- check_rate_limit(key, max_hits, window_seconds):
--   Incrementa o contador atômicamente. Se a window expirou, reseta.
--   Retorna TRUE quando dentro do limite, FALSE quando excedeu.
--
--   Caller padrão: scope key por (user_id, action) — ex.: 'password:<uuid>'
--   pra rate limit por user, OU 'login:<ip>' pra rate limit por IP.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key             TEXT,
  p_max             INT,
  p_window_seconds  INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits INT;
  v_now  TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.api_rate_limits (key, hits, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE
      WHEN public.api_rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
      THEN 1
      ELSE public.api_rate_limits.hits + 1
    END,
    window_start = CASE
      WHEN public.api_rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
      THEN v_now
      ELSE public.api_rate_limits.window_start
    END
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO   service_role;

COMMENT ON FUNCTION public.check_rate_limit IS
  'Sliding-window-like rate limiter. Retorna TRUE se a chamada está dentro do limite. Use scope keys tipo "password:<user_id>" pra isolar por user. Não é distribuído atomicamente — race entre instâncias é possível mas o ON CONFLICT serializa updates da mesma key, então o pior caso é ±1 hit por janela.';

-- ─── 2. Trigger: zera active_org_id quando membership é deletada ───────────
-- Fecha janela de exposição: Owner remove Trainer → membership DELETE →
-- trigger zera users.active_org_id do Trainer se apontava pra essa org.
-- Próxima request do Trainer → current_org() → NULL → RLS bloqueia tudo.
-- Sem trigger, Trainer continuava acessando dados da org até refresh do JWT
-- (~1h default).
--
-- IMPORTANTE: o JWT do user ainda pode ter `app_metadata.org_id` cached
-- — mas current_org() (040) ignora isso, lê só de users.active_org_id.
-- Então zerar a coluna é suficiente.

CREATE OR REPLACE FUNCTION public.clear_stale_active_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET active_org_id = NULL
  WHERE id = OLD.user_id
    AND active_org_id = OLD.org_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS memberships_clear_stale_active_org ON public.memberships;
CREATE TRIGGER memberships_clear_stale_active_org
  AFTER DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_active_org();

-- ─── 3. expire_trials() — função pra cron ──────────────────────────────────
-- Flippa subscription_status='trial' → 'inactive' onde trial_ends_at < now().
-- Idempotente (UPDATE não toca rows já 'inactive'). Retorna count pra
-- logging do cron caller.
--
-- Como agendar (escolha UMA):
--   (a) pg_cron (precisa extensão habilitada no Supabase Dashboard):
--       SELECT cron.schedule('expire-trials', '0 * * * *',
--         $$ SELECT public.expire_trials(); $$);
--   (b) Vercel Cron Job: GET /api/cron/expire-trials chama RPC
--   (c) Supabase Edge Function scheduled

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.organizations
  SET    subscription_status = 'inactive'
  WHERE  subscription_status = 'trial'
    AND  trial_ends_at IS NOT NULL
    AND  trial_ends_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_trials() TO   service_role;

COMMENT ON FUNCTION public.expire_trials IS
  'Flippa trials expirados pra inactive. Idempotente. Retorna número de rows atualizadas. Chamar via cron (pg_cron / Vercel Cron / Supabase Scheduled Function). get_user_org_context já trata trial vencido on-read; essa função alinha o estado físico do DB com a realidade.';
