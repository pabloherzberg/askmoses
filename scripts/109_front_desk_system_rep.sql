-- ============================================================
-- 109_front_desk_system_rep.sql
--
-- "Front Desk - AskMoses": um rep de SISTEMA por org, que recebe as calls
-- cujo GHLUSERID não está vinculado a nenhum membro — ou que chegam sem
-- userId no payload. Até aqui essas calls eram DESCARTADAS no webhook: 200
-- OK, nada no banco, nenhum alerta (gate introduzido em 55a8f3b, 02/07).
-- 150+ calls perdidas em 7 orgs em 4 dias, visíveis só no log da Vercel.
--
-- O Front Desk NÃO é um bucket técnico. Numa operação real ele é a RECEPÇÃO:
-- o lead liga pro número do sistema telefônico, a ligação cai num telefone
-- físico compartilhado e quem está mais perto atende. O sistema não tem como
-- saber qual das pessoas foi — mas alguém foi, e foi uma conversa de vendas
-- com um lead real. É um posto de trabalho, com volume, qualidade e taxa de
-- agendamento. Por isso ele aparece em TODAS as superfícies de rep (ranking,
-- Team Health, insights, Won Rate por rep, snapshot semanal, lista de
-- membros, dropdown de upload manual) SEM filtro de exibição.
--
-- Esconder o Front Desk recriaria o problema que originou tudo isto: uma
-- cliente viu uma lacuna sem explicação, construiu uma teoria própria
-- (achou que inbound não era processado) e abriu ticket. A invisibilidade é
-- o bug, não um efeito colateral aceitável.
--
-- ─── Atribuição PROVISÓRIA ──────────────────────────────────────────────────
-- Se o rep real for vinculado depois, a call migra pra ele com a nota junto
-- (lib/services/ghl-call-recovery.ts) — troca de trainer_id, sem reprocessar
-- áudio. Calls sem ghl_user_id no payload ficam no Front Desk em definitivo:
-- não há a quem atribuir.
--
-- ─── Inversão consciente da 096 ─────────────────────────────────────────────
-- A 096 desenhou essas calls como BLOQUEADAS (processing_status=
-- 'unlinked_trainer') justamente pra não gastar download/Whisper/LLM antes do
-- vínculo. Aqui a call é transcrita e pontuada NA HORA. Uma call bloqueada e
-- invisível não vale nada pro dono do negócio, e o custo unitário é ~US$0,018.
-- A 096 não é revertida: calls.ghl_user_id continua sendo a espinha da
-- reatribuição.
--
-- Estado do 'unlinked_trainer', para quem vier depois: o valor continua no
-- CHECK de processing_status e NÃO tem escritor desde 02/07 (55a8f3b removeu o
-- único, que existira por dois dias). Restaram 3 linhas reais, todas de
-- 01/07, numa única org — nunca transcritas, e a gravação no GHL provavelmente
-- já expirou. A decisão foi deixá-las como estão: ninguém sentiu falta delas em
-- dois meses, e mexer em produção por 3 calls não se paga. Não há limpeza
-- planejada; se um dia alguém quiser, é uma linha de SQL.
--
-- ─── is_system NÃO é filtro de exibição ─────────────────────────────────────
-- Tem quatro usos, todos funcionais:
--   1) índice único de um-Front-Desk-por-org (seção 2);
--   2) gate dos DOIS remetentes de email de coaching — o automático do
--      pipeline (lib/services/ghl-coaching-email.ts) e o manual do botão do
--      owner (lib/email/send-coaching-rec.ts). Não há destinatário: o email
--      é sintético, e o trainer_email cru do payload pode ser de alguém que
--      nem está na plataforma;
--   3) exclusão da contagem de assentos do plano (seção 4) — PREVENTIVO: hoje
--      max_sales_people está NULL nos três planos, então nada bloqueia. Se os
--      limites voltarem, o Front Desk não deve consumir assento, porque é
--      linha nossa e não um assento que o cliente comprou;
--   4) guard de ghl_user_id (aplicado na camada de app): vincular um GHLUSERID
--      ao Front Desk faria as calls daquele usuário ficarem lá pra sempre,
--      porque o rep resolvido já seria o Front Desk e a reatribuição nunca
--      dispararia.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

BEGIN;

-- ─── 1. Flags de sistema ────────────────────────────────────────────────────
-- Em users E em trainers de propósito. A lista de membros e a contagem de
-- assentos partem de memberships+users e NUNCA tocam em trainers — sem o flag
-- em users não há como excluir o Front Desk de nenhuma das duas.

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trainers.is_system IS
  'true = rep de sistema (Front Desk). NÃO é filtro de exibição: o Front Desk '
  'aparece em todas as superfícies de rep. Usado para o índice único por org e '
  'para o guard de ghl_user_id.';

COMMENT ON COLUMN public.users.is_system IS
  'true = usuário de sistema, sem conta no Supabase Auth e sem email real. '
  'Usado para excluir da contagem de assentos do plano e para gatear os '
  'remetentes de email de coaching.';

-- ─── 2. Um Front Desk por org ───────────────────────────────────────────────
-- Índice parcial: só as linhas de sistema disputam unicidade. É ele que torna
-- seguro o get-or-create preguiçoso no caminho do webhook — dois webhooks
-- simultâneos da mesma org perdem a corrida com 23505 em vez de criar dois
-- Front Desks.

CREATE UNIQUE INDEX IF NOT EXISTS trainers_org_system_uidx
  ON public.trainers(org_id)
  WHERE is_system;

-- ─── 3. Índice da reatribuição ──────────────────────────────────────────────
-- A busca deixou de ser por processing_status='unlinked_trainer' (096) e
-- passou a ser "as calls deste Front Desk feitas por este GHLUSERID".
-- calls_unlinked_ghl_user_id_idx fica no banco: é um índice parcial sobre 3
-- linhas, custa praticamente nada manter, e dropá-lo não traz benefício nenhum.

CREATE INDEX IF NOT EXISTS calls_trainer_ghl_user_idx
  ON public.calls(trainer_id, ghl_user_id)
  WHERE ghl_user_id IS NOT NULL;

-- ─── 4. Assentos do plano ignoram linhas de sistema ─────────────────────────
-- Recria enforce_seat_limit() (032) idêntica, com uma única diferença: linhas
-- cujo user tem is_system=true não disparam o gate NEM entram na contagem.
-- Sem as duas metades o Front Desk ou impede o próprio insert (P0001 numa org
-- no cap) ou rouba um assento pago do cliente.
--
-- PREVENTIVO hoje: max_sales_people está NULL nos três planos, e além disso
-- esta função resolve o plano pelo caminho legado organizations → clients →
-- plans (o.client_id), enquanto o app usa organizations.plan_id. Mantido o
-- join original de propósito — corrigir o caminho é outro assunto, não deste
-- commit.

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max       INT;
  v_count     INT;
  v_is_system BOOLEAN;
BEGIN
  SELECT u.is_system INTO v_is_system
  FROM   public.users u
  WHERE  u.id = NEW.user_id;

  -- Rep de sistema não consome assento: é linha nossa, não do cliente.
  IF COALESCE(v_is_system, false) THEN
    RETURN NEW;
  END IF;

  -- Só conta seats pra trainers. Owners não consomem (decisão de produto).
  IF NEW.role = 'trainer' AND NEW.invite_status IN ('pending', 'accepted') THEN
    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.org_id::text));

    SELECT p.max_sales_people
    INTO   v_max
    FROM   public.organizations o
    JOIN   public.clients       c ON c.id = o.client_id
    JOIN   public.plans         p ON p.id = c.plan_id
    WHERE  o.id = NEW.org_id;

    -- NULL = ilimitado (Pro+RAG). Skip.
    IF v_max IS NOT NULL THEN
      -- LEFT JOIN + COALESCE: uma membership cujo user sumiu não deve deixar
      -- de ser contada por causa do filtro de sistema.
      SELECT count(*)
      INTO   v_count
      FROM   public.memberships m
      LEFT   JOIN public.users u ON u.id = m.user_id
      WHERE  m.org_id        = NEW.org_id
        AND  m.role          = 'trainer'
        AND  m.invite_status IN ('pending', 'accepted')
        AND  COALESCE(u.is_system, false) = false;

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'PLAN_LIMIT_SEATS: org % at trainer cap (% / %)',
          NEW.org_id, v_count, v_max
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- O trigger em si não muda (BEFORE INSERT ON memberships) — recriado só pra
-- a migration ser autossuficiente se rodar num banco que perdeu o 032.
DROP TRIGGER IF EXISTS memberships_enforce_seat_limit ON public.memberships;
CREATE TRIGGER memberships_enforce_seat_limit
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

COMMIT;

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- Restaurar enforce_seat_limit() da 032 (scripts/032:36-77) e depois:
--   DROP INDEX  IF EXISTS public.calls_trainer_ghl_user_idx;
--   DROP INDEX  IF EXISTS public.trainers_org_system_uidx;
--   ALTER TABLE public.users    DROP COLUMN IF EXISTS is_system;
--   ALTER TABLE public.trainers DROP COLUMN IF EXISTS is_system;
--
-- ATENÇÃO: dropar trainers.is_system NÃO desfaz a atribuição — as calls
-- continuam apontando pro trainer_id do Front Desk, que vira um rep comum
-- chamado "Front Desk - AskMoses". Para desfazer de verdade é preciso
-- reatribuir ou apagar essas calls antes.
