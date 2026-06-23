-- ============================================================
-- 090_trainers_ghl_user_id.sql
--
-- Vincula cada membro (trainer/vendedor e owner) ao seu usuário no
-- GHL/Pepper. O `ghl_user_id` é o ID do usuário dentro da location do
-- GHL — o mesmo `userId` que chega no payload do webhook de call.
-- Guardar esse vínculo permite atribuir calls ao membro certo sem
-- depender de match por email (sujeito a divergência/erro de digitação).
--
-- Regras:
--   - É escopado por org: o mesmo ghl_user_id não pode estar vinculado
--     a dois membros DA MESMA org (índice único por tabela). Entre orgs
--     diferentes não há conflito (locations distintas no GHL).
--   - NULL é permitido (membro ainda sem vínculo / orgs sem GHL).
--   - Owner também aceita ghl_user_id — owners que também fazem calls
--     podem ser atribuídos pela mesma chave.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── trainers ──────────────────────────────────────────────────────────
ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS ghl_user_id TEXT;

-- Unicidade por org: impede reaproveitar o mesmo usuário GHL em dois
-- trainers da mesma org. Parcial — linhas com ghl_user_id NULL ficam
-- de fora (vários trainers podem estar sem vínculo simultaneamente).
CREATE UNIQUE INDEX IF NOT EXISTS trainers_org_ghl_user_id_uidx
  ON public.trainers(org_id, ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

-- Lookup por ghl_user_id (atribuição de call vinda do webhook).
CREATE INDEX IF NOT EXISTS trainers_ghl_user_id_idx
  ON public.trainers(ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

-- ─── owners ────────────────────────────────────────────────────────────
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS ghl_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS owners_org_ghl_user_id_uidx
  ON public.owners(org_id, ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS owners_ghl_user_id_idx
  ON public.owners(ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

-- Rollback (manual):
-- DROP INDEX IF EXISTS public.owners_ghl_user_id_idx;
-- DROP INDEX IF EXISTS public.owners_org_ghl_user_id_uidx;
-- ALTER TABLE public.owners DROP COLUMN IF EXISTS ghl_user_id;
-- DROP INDEX IF EXISTS public.trainers_ghl_user_id_idx;
-- DROP INDEX IF EXISTS public.trainers_org_ghl_user_id_uidx;
-- ALTER TABLE public.trainers DROP COLUMN IF EXISTS ghl_user_id;
