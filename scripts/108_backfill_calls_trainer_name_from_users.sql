-- ============================================================
-- 108_backfill_calls_trainer_name_from_users.sql
--
-- Corrige calls.trainer_name (e trainer_email vazio) para calls que já têm
-- trainer_id vinculado, usando o nome/email reais de `users` em vez do valor
-- cru que veio no payload do webhook GHL.
--
-- CAUSA RAIZ: o webhook (app/api/webhooks/ghl/route.ts) gravava trainer_name/
-- trainer_email direto do payload (customData.userName / customData.userEmail).
-- Quando o usuário do GHL não está configurado como "Phone System User"
-- individual na location (comum em owner que também vende), o GHL propaga o
-- nome/email da Location/Company em vez dos dados pessoais — ex.: a org
-- "Progressive Dog Training" aparecia como "sales person" em calls do Alvin
-- (owner), e o email vinha vazio, fazendo o coaching email ser pulado
-- silenciosamente (ver lib/services/ghl-coaching-email.ts).
--
-- O código do webhook foi corrigido para gravar users.name/users.email como
-- fonte de verdade a partir de agora (via trainerLink, ver
-- dbResolveTrainerForGhlCall em lib/db/trainers.ts). Este script repara o
-- histórico já gravado antes da correção.
--
-- Escopo: RESTRITO à org "Progressive Dog Training". Um preview rodado antes
-- deste script mostrou que outras orgs (ex.: Centurion K9) têm o mesmo
-- trainer_name aparecendo com VÁRIOS emails diferentes por call (ex.: "David
-- Gladora" com lindy@, david@, Emily@, lmallory2977@gmail.com...) — isso não
-- é o mesmo bug (payload cru do GHL sobrescrevendo nome/email de owner); pode
-- ser trainer_id compartilhado entre vendedores reais distintos, e rodar este
-- UPDATE lá apagaria emails de pessoas diferentes. Essas orgs precisam de
-- investigação própria antes de qualquer backfill — NÃO ampliar o escopo
-- deste script sem antes entender esse padrão.
--
-- Dentro do escopo (Progressive Dog Training): só toca calls com trainer_id
-- preenchido (vínculo confiável) cujo trainer_name diverge do nome
-- cadastrado, ou cujo trainer_email está vazio enquanto o trainer tem email
-- cadastrado. Nunca sobrescreve um trainer_email já preenchido.
--
-- Idempotente: reexecutar não altera nada além do que ainda estiver divergente.
-- ============================================================

BEGIN;

UPDATE public.calls c
SET trainer_name = u.name,
    updated_at = now()
FROM public.trainers t
JOIN public.users u ON u.id = t.user_id
WHERE c.trainer_id = t.id
  AND c.org_id = (SELECT id FROM public.organizations WHERE name = 'Progressive Dog Training')
  AND u.name IS NOT NULL
  AND u.name <> ''
  AND c.trainer_name IS DISTINCT FROM u.name;

UPDATE public.calls c
SET trainer_email = u.email,
    updated_at = now()
FROM public.trainers t
JOIN public.users u ON u.id = t.user_id
WHERE c.trainer_id = t.id
  AND c.org_id = (SELECT id FROM public.organizations WHERE name = 'Progressive Dog Training')
  AND u.email IS NOT NULL
  AND u.email <> ''
  AND (c.trainer_email IS NULL OR c.trainer_email = '');

COMMIT;

-- Conferência (rodar depois do COMMIT) — não deve sobrar divergência entre
-- calls.trainer_name/trainer_email e users.name/email para calls vinculadas
-- da Progressive Dog Training:
--   SELECT c.id, c.trainer_name, u.name AS real_name, c.trainer_email, u.email AS real_email
--   FROM public.calls c
--   JOIN public.trainers t ON t.id = c.trainer_id
--   JOIN public.users u ON u.id = t.user_id
--   WHERE c.org_id = (SELECT id FROM public.organizations WHERE name = 'Progressive Dog Training')
--     AND (c.trainer_name IS DISTINCT FROM u.name
--      OR (u.email IS NOT NULL AND u.email <> '' AND (c.trainer_email IS NULL OR c.trainer_email = '')));
