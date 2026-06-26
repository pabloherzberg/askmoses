-- ============================================================
-- 090_trainers_ghl_user_id.sql
--
-- Vincula cada trainer ao seu usuário no GHL/Pepper. O `ghl_user_id` é
-- o ID do usuário dentro da location do GHL — o mesmo `userId` que chega
-- no payload do webhook de call. Guardar esse vínculo permite atribuir
-- calls ao trainer certo sem depender de match por email (sujeito a
-- divergência/erro de digitação).
--
-- Owner que também faz calls NÃO ganha coluna própria: ele recebe uma
-- linha em `trainers` (perfil de calls, com owner_id apontando pra si
-- mesmo) e a atribuição usa o ghl_user_id dessa linha. Assim todo o
-- pipeline (scoring, /me, ranking, coaching) é reaproveitado sem mexer
-- no modelo de papéis (memberships continua 1 papel por org).
--
-- Regras:
--   - É escopado por org: o mesmo ghl_user_id não pode estar vinculado
--     a dois trainers DA MESMA org. Entre orgs diferentes não há
--     conflito (locations distintas no GHL).
--   - NULL é permitido (trainer ainda sem vínculo / orgs sem GHL).
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

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

-- Rollback (manual):
-- DROP INDEX IF EXISTS public.trainers_ghl_user_id_idx;
-- DROP INDEX IF EXISTS public.trainers_org_ghl_user_id_uidx;
-- ALTER TABLE public.trainers DROP COLUMN IF EXISTS ghl_user_id;
