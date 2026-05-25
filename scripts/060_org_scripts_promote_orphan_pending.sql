-- ============================================================
-- 060_org_scripts_promote_orphan_pending.sql
--
-- Cobre o gap da migration 057: orgs onde o send_script_to_orgs antigo
-- (050-053) fazia ON CONFLICT DO UPDATE setando status='pending' por cima
-- do active. Resultado: a org ficou COM TODAS as rows como 'pending' e
-- 0 actives no histórico — então o backfill da 057 (que reabre o último
-- status='active' fechado) não tinha o que reabrir.
--
-- Sintoma: send_script_to_orgs roda OK e cria/atualiza pending, mas o
-- painel /admin (list_admin_organizations com filtro effective_status
-- IN active|deprecated da 058/059) segue mostrando "NO SCRIPT" porque
-- a org não tem nenhum active.
--
-- Fix: pra cada org sem nenhuma row 'active' (qualquer ended_at),
-- promover o pending mais recente (preferindo o aberto, senão o último
-- fechado por started_at) a status='active', ended_at=NULL. Trata como
-- aceite implícito do estado real anterior ao bug.
--
-- Não toca em:
--   - Orgs que JÁ têm pelo menos uma row 'active' (qualquer ended_at).
--   - Rows 'rejected' (decisão explícita do owner, preservada).
--
-- Idempotente. Rodar depois cria 0 atualizações.
-- ============================================================

UPDATE public.org_scripts AS promote
   SET status   = 'active',
       ended_at = NULL
  FROM (
    SELECT DISTINCT ON (os.org_id)
      os.id
    FROM public.org_scripts os
    WHERE os.status = 'pending'
      AND NOT EXISTS (
        -- Org não tem NENHUMA active na história (qualquer ended_at).
        SELECT 1 FROM public.org_scripts any_active
        WHERE any_active.org_id = os.org_id
          AND any_active.status = 'active'
      )
    -- Preferência:
    --   1º) pending aberto (ended_at IS NULL) — esse era o estado vivo.
    --   2º) último pending fechado por started_at DESC — orgs onde tudo
    --       foi fechado (raro, mas defendível).
    ORDER BY os.org_id,
             (os.ended_at IS NULL) DESC,
             os.started_at         DESC
  ) AS pick
 WHERE promote.id = pick.id;
