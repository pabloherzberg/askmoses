-- ============================================================
-- 074_script_gaps.sql
-- Script Gap Detection — atritos detectados entre o que o SCRIPT
-- instrui o vendedor a fazer e o que ACONTECE NA PRÁTICA na conversa
-- (vendedor + prospect). Distinto do Script Intelligence (cobertura/
-- qualidade do script): aqui o foco é o atrito real e a sugestão
-- cirúrgica de reescrita apenas do trecho com fricção.
--
-- accepted_at IS NULL = gap pendente (aparece no dashboard).
-- accepted_at preenchido = owner já aplicou a reescrita no script.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.script_gaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section             TEXT NOT NULL,                       -- ex: "Objection Handling"
  script_instruction  TEXT NOT NULL,                       -- o que o script manda fazer
  observed_pattern    TEXT NOT NULL,                       -- o que acontece na conversa (vendedor + prospect)
  frequency           INT  NOT NULL,                       -- % das calls onde o padrão aparece
  severity            TEXT NOT NULL CHECK (severity IN ('high','medium','low')),
  suggested_fix       TEXT NOT NULL,                       -- nova redação apenas do trecho com atrito
  calls_analyzed      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array de call IDs analisados
  analyzed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,                         -- NULL = pendente
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.script_gaps ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (API routes usam admin client)
CREATE POLICY "script_gaps_service_role" ON public.script_gaps
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Owner pode ler os gaps da própria org via JWT
CREATE POLICY "script_gaps_select_org" ON public.script_gaps
  FOR SELECT
  USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_script_gaps_org_accepted
  ON public.script_gaps (org_id, accepted_at);

-- ============================================================
-- Seed — gaps de exemplo para a org de demo "Dog Wizard HQ".
-- Mocks temporários (negócio fictício de adestramento de cães);
-- removíveis quando houver pipeline de IA gerando gaps reais.
-- Os 3 call IDs referenciados existem no seed da org de demo.
-- ============================================================
INSERT INTO public.script_gaps
  (org_id, section, script_instruction, observed_pattern, frequency, severity, suggested_fix, calls_analyzed, analyzed_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000100',
    'Offer Presentation',
    'Após a descoberta, apresente o programa completo de 6 semanas antes de tratar qualquer objeção.',
    'Em todas as 3 calls o prospect interrompe a apresentação com uma objeção de agenda ("não sei se tenho tempo pra isso agora", "minha semana é uma loucura") antes de ouvir a oferta — e o vendedor não tem no script uma resposta pronta, então improvisa e perde o controle da conversa.',
    100,
    'high',
    'Após a descoberta, pergunte sobre a disponibilidade de agenda da família antes de apresentar o programa. Trate a objeção de tempo primeiro: "Antes de te mostrar como funciona, me conta — como tá a rotina de vocês? Quero garantir que o que eu apresentar caiba na vida real de vocês."',
    '["00000000-0000-0000-0000-000000000601","00000000-0000-0000-0000-000000000608","00000000-0000-0000-0000-000000000613"]'::jsonb,
    '2026-06-04T16:20:00.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000100',
    'Objection Handling',
    'Quando o prospect questionar o preço, ofereça uma opção de pagamento parcelado para reduzir a fricção.',
    'Em 2 das 3 calls o prospect não está questionando o valor em si — está questionando se o programa vai mesmo funcionar com o cão dele ("já tentei adestrador antes e não adiantou"). O vendedor responde com parcelamento, o que soa como desconto e enfraquece a percepção de valor; o prospect esfria.',
    67,
    'high',
    'Antes de falar em pagamento, isole a objeção real: "Quando você diz que é caro, é o valor em si ou é o receio de investir de novo e não ver resultado? [pausa] Deixa eu te contar como a gente garante o resultado pro [nome do cão]." Só fale de parcelamento se a objeção for genuinamente financeira.',
    '["00000000-0000-0000-0000-000000000601","00000000-0000-0000-0000-000000000608","00000000-0000-0000-0000-000000000613"]'::jsonb,
    '2026-06-04T16:20:00.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000100',
    'Discovery',
    'Pergunte há quanto tempo o comportamento acontece e o que já foi tentado.',
    'O vendedor faz as 2 perguntas do script e segue em frente, mas os prospects costumam abrir uma dor emocional logo depois ("a gente nem consegue receber visita em casa") que fica sem ser explorada — o script não instrui o vendedor a aprofundar no impacto.',
    67,
    'medium',
    'Após as duas perguntas iniciais, adicione uma pergunta de impacto: "E o que esse comportamento tem custado pra vocês no dia a dia — em estresse, na relação com o [nome do cão], em receber pessoas em casa?"',
    '["00000000-0000-0000-0000-000000000601","00000000-0000-0000-0000-000000000608","00000000-0000-0000-0000-000000000613"]'::jsonb,
    '2026-06-04T16:20:00.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000100',
    'Close & Next Steps',
    'Encerre resumindo os benefícios do programa e diga que pode enviar mais informações por e-mail.',
    'Quando o vendedor oferece "mandar mais informações", o prospect aceita e a call termina sem agendamento — em 1 das 3 calls o prospect estava claramente quente e mesmo assim saiu sem próximo passo concreto.',
    33,
    'low',
    'Substitua o "mando informações" por um pedido direto de agendamento: "Pelo que você me contou, acho que o [nome do cão] se daria muito bem com a gente. Tenho um horário abrindo na [dia] — fecho ele pra vocês virem conhecer a equipe?"',
    '["00000000-0000-0000-0000-000000000601","00000000-0000-0000-0000-000000000608","00000000-0000-0000-0000-000000000613"]'::jsonb,
    '2026-06-04T16:20:00.000Z'
  );
