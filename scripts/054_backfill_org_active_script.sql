-- ============================================================
-- 051_backfill_org_active_script.sql
--
-- A partir desta task, toda org deve obrigatoriamente ter um script
-- ATIVO (e portanto uma rubric, derivada via scripts.rubric_id) — os
-- dois são fundamentais pra análise.
--
-- Esta migration faz o backfill: cada org com plano (plan_id NOT NULL)
-- que ainda não tem nenhuma linha aberta em org_scripts recebe o script
-- seed "Dog Training v1.0" (20000000-0000-0000-0000-000000000001,
-- seedado na migration 044) como status='active'.
--
-- Defensivo: só insere se o script seed existir. Idempotente — o
-- NOT EXISTS evita duplicar em re-runs, e o partial unique
-- uniq_org_scripts_open_per_org (migration 046) é a rede de segurança.
-- ============================================================

DO $$
DECLARE
  v_seed_script_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  -- Aborta silenciosamente se o seed não existe (044 não rodou nesse env).
  IF NOT EXISTS (SELECT 1 FROM public.scripts WHERE id = v_seed_script_id) THEN
    RAISE NOTICE '[051] Script seed % ausente — backfill pulado.', v_seed_script_id;
    RETURN;
  END IF;

  INSERT INTO public.org_scripts (org_id, script_id, status, started_at)
  SELECT
    o.id,
    v_seed_script_id,
    'active',
    now()
  FROM public.organizations o
  WHERE o.plan_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM public.org_scripts os
       WHERE os.org_id = o.id
         AND os.ended_at IS NULL
    );

  RAISE NOTICE '[051] Backfill de org_scripts concluído.';
END $$;
