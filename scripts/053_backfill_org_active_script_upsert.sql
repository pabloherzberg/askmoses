-- ============================================================
-- 053_backfill_org_active_script_upsert.sql
--
-- Substitui a 051 (que dava 23505 duplicate key). Toda org com plano
-- sem script ATIVO recebe o script seed como status='active'.
--
-- Fix vs 051: a constraint UNIQUE (org_id, script_id) vale independente
-- de ended_at. Se a org já teve esse script associado (linha encerrada,
-- ended_at NOT NULL), o INSERT da 051 colidia. Aqui usamos
-- ON CONFLICT (org_id, script_id) DO UPDATE — reativa a linha existente
-- (status='active', ended_at=NULL) em vez de duplicar.
--
-- Trocar v_seed_script_id pelo id do script default desejado.
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  v_seed_script_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scripts WHERE id = v_seed_script_id) THEN
    RAISE NOTICE '[053] Script % ausente — backfill pulado.', v_seed_script_id;
    RETURN;
  END IF;

  INSERT INTO public.org_scripts (org_id, script_id, status, started_at, ended_at)
  SELECT o.id, v_seed_script_id, 'active', now(), NULL
  FROM public.organizations o
  WHERE o.plan_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.org_scripts os
      WHERE os.org_id = o.id AND os.ended_at IS NULL
    )
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status = 'active', ended_at = NULL, started_at = now();

  RAISE NOTICE '[053] Backfill de org_scripts concluído.';
END $$;
