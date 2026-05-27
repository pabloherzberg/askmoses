-- ============================================================
-- 068_backfill_orphan_orgs_with_default_template.sql
--
-- Backfill: vincula um script ativo a toda org que está SEM linha em
-- `org_scripts` com `status='active' AND ended_at IS NULL`.
--
-- Cenário: orgs criadas via /api/onboarding/organization antes do fix da
-- sessão 2026-05-26 nascem sem row em org_scripts. /api/analyze barra
-- (com 400) essas orgs até que algum script ativo exista. Este backfill
-- corrige o estado herdado.
--
-- Ordem de preferência por org (mesma de dbGetActiveOrgScript pós-fix):
--   1. Script local da org com is_active=true (scripts.org_id=<orgId>
--      AND is_active=true ORDER BY created_at DESC LIMIT 1). Respeita a
--      escolha que o Owner já fez via mecanismo legado.
--   2. Template admin mais recente (scripts.org_id IS NULL ORDER BY
--      created_at DESC LIMIT 1). Fallback quando a org nunca teve script
--      ativo nem no antigo nem no novo mecanismo.
--
-- Regras:
--   - Scripts org-local de OUTRAS orgs (org_id != <orgId>) nunca são
--     auto-linkados — são privados da org dona.
--   - Idempotente: re-rodar não cria duplicatas; o filtro `WHERE NOT
--     EXISTS` ignora orgs que já têm active aberto.
--
-- Idempotente. Rode após 067.
-- ============================================================

DO $$
DECLARE
  v_template_id        UUID;
  v_inserted_legacy    INT;
  v_inserted_template  INT;
BEGIN
  -- ─── 1) Resolve template admin mais recente (fallback global) ──────────
  SELECT id INTO v_template_id
    FROM public.scripts
   WHERE org_id IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  -- ─── 2) Preferência: script local com is_active=true ───────────────────
  -- Pra cada org órfã que JÁ TEM um script local marcado como ativo,
  -- linka esse mesmo script em org_scripts. sent_by=NULL: backfill
  -- sistêmico (FK ON DELETE SET NULL permite, ver migration 044:66).
  WITH orphan_orgs AS (
    SELECT o.id AS org_id
      FROM public.organizations o
     WHERE NOT EXISTS (
       SELECT 1 FROM public.org_scripts os
        WHERE os.org_id = o.id
          AND os.status = 'active'
          AND os.ended_at IS NULL
     )
  ),
  pick_legacy AS (
    SELECT DISTINCT ON (oo.org_id)
      oo.org_id, s.id AS script_id
      FROM orphan_orgs oo
      JOIN public.scripts s ON s.org_id = oo.org_id AND s.is_active = TRUE
     ORDER BY oo.org_id, s.created_at DESC
  ),
  inserted_legacy AS (
    INSERT INTO public.org_scripts (org_id, script_id, status, started_at, ended_at, sent_by)
    SELECT pl.org_id, pl.script_id, 'active', now(), NULL, NULL
      FROM pick_legacy pl
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted_legacy FROM inserted_legacy;

  -- ─── 3) Fallback: template admin pras orgs que continuaram órfãs ───────
  IF v_template_id IS NULL THEN
    RAISE NOTICE '[068 backfill] sem template admin (scripts.org_id IS NULL) — pulando fallback. Legacy linked=%', v_inserted_legacy;
  ELSE
    WITH inserted_tpl AS (
      INSERT INTO public.org_scripts (org_id, script_id, status, started_at, ended_at, sent_by)
      SELECT o.id, v_template_id, 'active', now(), NULL, NULL
        FROM public.organizations o
       WHERE NOT EXISTS (
         SELECT 1 FROM public.org_scripts os
          WHERE os.org_id = o.id
            AND os.status = 'active'
            AND os.ended_at IS NULL
       )
      RETURNING 1
    )
    SELECT count(*) INTO v_inserted_template FROM inserted_tpl;

    RAISE NOTICE '[068 backfill] template=% / legacy linked=% / template linked=%',
      v_template_id, v_inserted_legacy, v_inserted_template;
  END IF;
END $$;
