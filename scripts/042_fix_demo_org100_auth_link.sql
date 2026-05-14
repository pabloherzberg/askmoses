-- ============================================================
-- 042_fix_demo_org100_auth_link.sql
-- Vincula os Auth users de demo (trainer@, owner@) às rows
-- corretas de public.users, memberships e trainers da org 100
-- (Dog Wizard HQ).
--
-- Problema que resolve:
--   setup-supabase.mjs cria os 3 Auth users mas não garante
--   que public.users.active_org_id esteja preenchido, nem que
--   exista membership(user_id, org_id) para eles.
--   get_user_org_context() lê users.active_org_id via JOIN —
--   sem isso, getOrgId() retorna null e todas as queries de
--   calls/rubric/trainers retornam [] silenciosamente.
--
-- Idempotente: UPDATE ... WHERE IS NULL, INSERT ... ON CONFLICT.
-- ============================================================

DO $$
DECLARE
  v_trainer_auth_id  UUID;
  v_owner_auth_id    UUID;
  v_org_id           UUID := '00000000-0000-0000-0000-000000000100';
  v_trainer_user_id  UUID := '00000000-0000-0000-0000-000000000201'; -- Marcus R.
  v_trainer_db_id    UUID := '00000000-0000-0000-0000-000000000301'; -- trainers.id do Marcus
  v_rubric_id        UUID := 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';
BEGIN

  -- 1. Resolver IDs reais dos Auth users via email
  SELECT id INTO v_trainer_auth_id
  FROM auth.users
  WHERE email = 'trainer@demo.askmoses.ai'
  LIMIT 1;

  SELECT id INTO v_owner_auth_id
  FROM auth.users
  WHERE email = 'owner@demo.askmoses.ai'
  LIMIT 1;

  -- ── TRAINER ──────────────────────────────────────────────────────────────────

  IF v_trainer_auth_id IS NOT NULL THEN

    -- 2a. Garantir row em public.users para o Auth user do trainer
    INSERT INTO public.users (id, name, email, avatar, avatar_color, role, invite_status, active_org_id)
    VALUES (
      v_trainer_auth_id,
      'Marcus Rivera',
      'trainer@demo.askmoses.ai',
      'MR',
      'blue',
      'trainer',
      'accepted',
      v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
      active_org_id = EXCLUDED.active_org_id,
      invite_status = 'accepted';

    -- 2b. Garantir membership
    INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_at)
    VALUES (v_trainer_auth_id, v_org_id, 'trainer', 'accepted', now())
    ON CONFLICT (user_id, org_id) DO UPDATE SET
      invite_status = 'accepted';

    -- 2c. Garantir row em trainers vinculando o Auth user_id
    -- Se o trainer mock (301) ainda está com user_id do mock (201), atualizar
    -- para o Auth user real. Caso já exista uma row com user_id=v_trainer_auth_id,
    -- só garantir org_id e invite_status.
    IF EXISTS (
      SELECT 1 FROM public.trainers WHERE id = v_trainer_db_id
    ) THEN
      UPDATE public.trainers
      SET
        user_id = v_trainer_auth_id,
        org_id  = v_org_id
      WHERE id = v_trainer_db_id;
    ELSE
      INSERT INTO public.trainers (user_id, org_id, total_calls, close_rate, close_delta, score, score_delta, last_active,
                                    score_discovery, score_problem_agitation, score_offer_presentation,
                                    score_objection_handling, score_close_next_steps)
      VALUES (v_trainer_auth_id, v_org_id, 28, 74, 9, 91, 11, 'Active today', 94, 89, 95, 81, 90);
    END IF;

    -- 2d. Vincular calls do Marcus ao Auth trainer_id real
    UPDATE public.calls
    SET trainer_id = v_trainer_auth_id
    WHERE trainer_id = v_trainer_user_id
      AND org_id = v_org_id;

  END IF;

  -- ── OWNER ─────────────────────────────────────────────────────────────────────

  IF v_owner_auth_id IS NOT NULL THEN

    -- 3a. Garantir row em public.users para o Auth user do owner
    INSERT INTO public.users (id, name, email, avatar, avatar_color, role, invite_status, active_org_id)
    VALUES (
      v_owner_auth_id,
      'Demo Owner',
      'owner@demo.askmoses.ai',
      'DO',
      'amber',
      'owner',
      'accepted',
      v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
      active_org_id = EXCLUDED.active_org_id,
      invite_status = 'accepted';

    -- 3b. Garantir membership
    INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_at)
    VALUES (v_owner_auth_id, v_org_id, 'owner', 'accepted', now())
    ON CONFLICT (user_id, org_id) DO UPDATE SET
      invite_status = 'accepted';

  END IF;

  -- ── RUBRIC: garantir is_default=true para org 100 ────────────────────────────

  UPDATE public.rubrics
  SET
    is_default = true,
    is_active  = true,
    org_id     = v_org_id
  WHERE id = v_rubric_id;

  -- Garantir que criteria também tem org_id correto
  UPDATE public.criteria
  SET org_id = v_org_id
  WHERE rubric_id = v_rubric_id
    AND (org_id IS NULL OR org_id != v_org_id);

  -- ── SUBSCRIPTION: garantir que org 100 tem sub ativa ─────────────────────────

  UPDATE public.organizations
  SET subscription_status = 'active'
  WHERE id = v_org_id
    AND subscription_status != 'active';

  RAISE NOTICE 'trainer_auth_id=%  owner_auth_id=%', v_trainer_auth_id, v_owner_auth_id;

END $$;
