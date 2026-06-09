# Plano: Novas Features — AskMoses (Fase 2 Setup)

## Contexto

Durante uma reunião, foram definidas as próximas features a implementar no AskMoses. Este plano traduz os esboços anotados em tarefas concretas, com base no estado atual do projeto (Fase 1 praticamente concluída — TASK-020 a TASK-023 ainda pendentes).

As features se dividem em 5 blocos: Stripe na LP, billing por minuto, coluna `intent` nas calls, Script Gap Detection e migração do Centurion.

---

## TASK-A: Stripe na Landing Page

**Contexto:** A LP (`app/[locale]/page.tsx`) já tem uma seção de Pricing com 3 planos (Solo, Pro, Enterprise) que hoje apenas linkam para `#demo`. O objetivo é conectar esses planos ao Stripe real para iniciar o checkout.

**Decisões já tomadas:**
- Planos mantidos na LP: **SIM**
- Valores: **US$500** e **US$1.250** (dois planos pagos)
- Tela para trocar cartão de cobrança: **NÃO**
- Opção para alterar o plano: **NÃO**

**O que fazer:**
1. Instalar `stripe` e `@stripe/stripe-js` como dependências
2. Criar produtos/preços no Stripe Dashboard (US$500/mês e US$1.250/mês)
3. Criar API route `POST /api/stripe/checkout` — recebe `planId`, cria Stripe Checkout Session, retorna `url`
4. Criar API route `GET /api/stripe/webhook` — processa `checkout.session.completed` e persiste status no Supabase (campo `subscriptionStatus` do client)
5. Atualizar o componente `components/landing/pricing.tsx` — botões dos planos pagos disparam `POST /api/stripe/checkout` e redirecionam para URL do Stripe; plano gratuito (se houver) mantém link para `#demo`
6. Adicionar variáveis de ambiente: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Arquivos críticos:**
- `app/[locale]/page.tsx`
- `components/landing/pricing.tsx`
- `app/api/stripe/checkout/route.ts` *(novo)*
- `app/api/stripe/webhook/route.ts` *(novo)*
- `lib/types.ts` — verificar se `Client.subscriptionStatus` precisa de novos valores

---

## TASK-B: Billing por Minuto + Histórico de Cobranças

**Contexto:** O modelo de cobrança muda de MRR fixo para **consumo por minuto (US$2/min)**. Calls já têm `duration: string` (ex: `"38min"`) no mock — precisa virar `durationMinutes: number` para cálculos.

**Visibilidade por role:**
- **Owner** → vê **apenas a quantidade de minutos por call** na tabela `/calls`. **Nunca vê custo, em nenhuma tela.**
- **Admin** → vê **quantidade de minutos + valor total** (minutos × US$2) por organização na tela de billing e nos cards do painel.

**Sub-tarefas:**

### B1 — Cálculo de minutos nas calls
1. Atualizar `lib/types.ts` — adicionar `durationMinutes: number` no tipo `Call`
2. Atualizar `lib/mock-data.ts` — converter `duration: "38min"` para incluir `durationMinutes: 38` em todas as 21 calls
3. Criar helper `lib/utils.ts` — `minutesToCost(minutes: number): string` → `(minutes * 2).toLocaleString('en-US', { style: 'currency', currency: 'USD' })` *(usado apenas nas views de admin)*

### B2 — Coluna de minutos na tabela `/calls` (visão owner)
1. Atualizar `app/[locale]/calls/CallsTable.tsx` — adicionar coluna **"Duration"** mostrando apenas `Xmin` (ex: `38min`)
2. Colocar entre "Score" e "Result"
3. **Não exibir custo** nesta coluna — owner vê só a duração em minutos

### B3 — Substituir MRR por Minutos + Custo na tabela do SaaS Panel
O admin tem uma tabela de organizações no **Global Overview** (`/admin`, aba Organizations via `AdminPanelTabs`). Hoje essa tabela exibe a coluna `MRR` por org. A mudança é:

1. Atualizar a tabela de orgs em `app/[locale]/(admin)/admin/page.tsx` (ou no componente `AdminPanelTabs`) — substituir a coluna **MRR** por **Minutes** (`Xmin`) e **Cost** (`US$X`) por organização
2. Atualizar `lib/mock-data.ts` — remover campo `mrr` do tipo `Client`, adicionar `totalMinutesThisMonth: number` e `totalCostThisMonth: number` (calculado como `totalMinutesThisMonth * 2`)
3. Atualizar `lib/mocks/handlers.ts` — ajustar resposta de `GET /api/clients` para os novos campos



**Arquivos críticos:**
- `lib/types.ts`
- `lib/mock-data.ts`
- `lib/mocks/handlers.ts`
- `app/[locale]/calls/CallsTable.tsx`
- `app/[locale]/(admin)/admin/page.tsx`
- `components/layout/AdminSidebar.tsx`
- `app/[locale]/(admin)/admin/billing/page.tsx` *(novo)*

---

## TASK-C: Coluna `intent` nas Calls + Feedback no Coaching Email

**Contexto:** `intent` é um score de **1 a 5** que representa o quanto o prospect demonstrou intenção de compra durante a call — calculado pela IA com base na transcrição. Regras:
- `result === 'closed'` → `intent` é sempre **5** (regra fixa, sem análise)
- `result !== 'closed'` → `intent` é calculado pela IA analisando a transcrição da call: tom do prospect, perguntas feitas, objeções levantadas, engajamento e sinais de interesse real

A IA não infere intent a partir do resultado — ela lê o que o prospect disse e decide o score de 1 a 5 de forma independente. O resultado da call pode coincidir ou não com o intent detectado.

Além disso, o email de coaching deve incluir uma seção comentando sobre a intenção de compra detectada pela IA.

**Sub-tarefas:**

### C1 — Adicionar campo `intent` nos dados
1. Atualizar `lib/types.ts` — adicionar `intent: 1 | 2 | 3 | 4 | 5` no tipo `Call`
2. Atualizar `lib/mock-data.ts` — adicionar `intent` em todas as 21 calls:
   - `result === 'closed'` → sempre `intent: 5` (regra fixa)
   - `result !== 'closed'` → valores variados (1–4) simulando o score que a IA calcularia — não devem seguir o resultado mecanicamente; um `partial` pode ter `intent: 2` se o prospect estava desengajado, um `no_outcome` pode ter `intent: 4` se o prospect demonstrou interesse mas não fechou por obstáculo externo

### C2 — Componente `IntentBadge`
1. Criar `components/shared/IntentBadge.tsx` — exibe 1–5 estrelas (ou ícones de chama) com cor:
   - 5 → verde (`--am-green`)
   - 3–4 → âmbar (`--am-amber`)
   - 1–2 → vermelho (`--am-red`)

### C3 — Coluna `Intent` na tabela `/calls`
1. Atualizar `app/[locale]/calls/CallsTable.tsx` — adicionar coluna **"Intent"** usando `IntentBadge`
2. Colocar entre "Duration" e "Score"

### C4 — Adicionar `intent` no detalhe da call `/calls/[id]`
1. Atualizar o componente de detalhe `app/[locale]/calls/[id]/` — exibir `IntentBadge` no header/overview da call

### C5 — Feedback de intent no Coaching Email
1. Atualizar `app/api/send-coaching/route.ts` — incluir no payload uma seção `intentFeedback` com texto baseado no score de intent
2. Criar helper `lib/utils/intentFeedback.ts` — retorna frase de coaching baseada no valor de 1–5:
   - 5: "O prospect demonstrou intenção de compra muito clara — ótimo trabalho conduzindo o fechamento."
   - 4: "O prospect sinalizou forte interesse. Faltou pouco para o fechamento — revisite as objeções."
   - 3: "Intenção moderada. O prospect estava engajado mas inseguro. Aprofunde o problema na próxima call."
   - 2: "Baixa intenção detectada. O prospect pode não ser o decisor ou o fit pode ser fraco."
   - 1: "Nenhuma intenção de compra identificada. Avalie se vale reengajar ou desqualificar o lead."
3. Atualizar o template de email para renderizar essa seção

**Arquivos críticos:**
- `lib/types.ts`
- `lib/mock-data.ts`
- `components/shared/IntentBadge.tsx` *(novo)*
- `app/[locale]/calls/CallsTable.tsx`
- `app/[locale]/calls/[id]/page.tsx` (ou componente de detalhe)
- `app/api/send-coaching/route.ts`

---

## TASK-D: Script Gap Detection (Owner-específico, diário)

**Contexto:** A IA analisa 3 calls da própria organização e detecta onde o script atual está gerando atrito — ou seja, trechos específicos que estão em conflito com o que os prospects da organização mais falam ou repetem. O resultado é uma **sugestão de melhoria cirúrgica**: não troca o script inteiro, apenas aponta e propõe a reescrita do trecho problemático.

Cada análise é isolada por organização — os gaps detectados refletem o comportamento dos prospects daquela org específica, não de outras. O objetivo é que o owner receba uma indicação clara de qual parte do script precisa ser ajustada e por quê, com a opção de aceitar ou ignorar cada sugestão.

A feature de script intelligence já existe em `app/[locale]/dashboard/insights/` com gap detection por seção. A nova feature é **diferente**: foca em linguagem/comportamento do prospect *versus* o que o script instrui.

**Diferença da feature existente:**

- **Script Intelligence** (`/dashboard/insights`): analisa qualidade e cobertura do script do ponto de vista do vendedor
  > *Exemplo: "A seção de Objection Handling está fraca — o script não cobre a objeção de preço. Recomendamos adicionar um reframe de valor antes de apresentar o investimento."*

- **Script Gap Detection** (`/script-gap`): detecta conflito entre o que o script instrui o vendedor a fazer e o que os prospects *daquela organização* repetem na prática — e sugere apenas a reescrita do trecho problemático
  > *Exemplo: "O script pede para o vendedor apresentar o programa completo logo após a descoberta, mas 2 das 3 calls analisadas mostram que os prospects da Dog Wizard HQ interrompem com objeções de tempo antes de ouvir a oferta. Sugestão: mover a apresentação do programa para depois de tratar a objeção de agenda."*

**Sub-tarefas:**

### D1 — Dados mock do Gap Detection
1. Criar `lib/mocks/data/script-gap-detection.ts` — mock de `ScriptGapAnalysis`:
   ```typescript
   ScriptGapAnalysis {
     analyzedAt: string
     callsAnalyzed: string[]  // 3 call IDs
     gaps: ScriptGap[]
   }
   ScriptGap {
     id: string
     section: string          // ex: "Objection Handling"
     scriptInstruction: string // o que o script pede
     prospectPattern: string   // o que os prospects repetem
     frequency: number         // % das calls analisadas
     severity: 'high' | 'medium' | 'low'
     suggestedFix: string      // nova redação apenas para o trecho com gap
   }
   ```
2. Adicionar à `lib/types.ts`

### D2 — API Route
1. Criar `GET /api/script-gap-detection` — retorna o resultado da análise mais recente para o owner logado
2. Adicionar handler no MSW

### D3 — Página de Script Gap Detection
1. Criar `app/[locale]/script-gap/page.tsx` — **acessível apenas para owner** (admin não acessa)
2. Layout:
   - Header: "Script Gap Detection" + data da última análise + "3 calls analyzed"
   - Lista de gaps em cards: seção afetada, instrução do script, padrão do prospect, frequência, severidade
   - Botão **"Accept Gap"** por card: ao aceitar, abre modal com o `suggestedFix` para revisar/confirmar antes de aplicar
   - Ao confirmar: faz `PATCH /api/scripts/:id` atualizando apenas o trecho do gap (não substitui o script inteiro)
3. Adicionar link "Script Gap" na `OwnerSidebar`

### D4 — Lógica de "Accept Gap"
1. A ação de aceitar substitui **apenas o trecho do script** correspondente ao gap, não o script inteiro
2. Exibir diff visual: texto antigo (riscado/vermelho) vs texto novo (verde)
3. Persiste via `PATCH /api/scripts/:id` (já existe como passthrough no MSW)

**Arquivos críticos:**
- `lib/types.ts`
- `lib/mocks/data/script-gap-detection.ts` *(novo)*
- `lib/mocks/handlers.ts`
- `app/[locale]/script-gap/page.tsx` *(novo)* + `app/[locale]/script-gap/layout.tsx` *(novo)*
- `components/layout/AppSidebar.tsx` *(OwnerNavItems — `OwnerSidebar` foi consolidada em `AppSidebar`)*
- `middleware.ts` *(trainer bloqueado de `/script-gap`)*
- `messages/{en,pt,fr,es}.json` *(i18n: `Shared.sidebar.scriptGap` + namespace `Owner.scriptGap`)*

> **STATUS: ✅ CONCLUÍDA** — Implementada conforme o spec refinado da task: o campo é `observedPattern` (vendedor + prospect), não apenas `prospectPattern`. Decisões: o **GET** usa handler MSW (só dev); o **Accept Gap** chama o **PATCH /api/scripts/:id real**, substituindo apenas a `instructions` da section com atrito (fallback: trecho literal dentro de `full_script`) — nunca o script inteiro. Na demo (sem sessão Supabase real) o PATCH retorna 401/404 e é tratado de forma graciosa (aceite otimista no estado local). Link "Script Gap" só na `OwnerNavItems` (removido da `ImpersonateNavItems` por ser ação de escrita, fora da whitelist read-only de impersonate).

---

## TASK-E: Refatoração do Script Builder

**Contexto:** O Script Builder atual (`app/[locale]/dashboard/script-builder/page.tsx`) é um wizard de 4 etapas que permite ao usuário adicionar, remover e desativar seções livremente. A nova regra é que as seções do script são **sempre fixas e imutáveis** — as mesmas 5 seções em toda e qualquer criação de script, sem exceção. O que o usuário pode editar é apenas o nome do script, a descrição, o peso de cada seção e se uma seção é crítica.

**As 5 seções fixas (sempre nesta ordem):**
1. Discovery
2. Problem Agitation
3. Offer Presentation
4. Objection Handling
5. Close & Next Steps

**O que remover:**

### E1 — Remover botão "Add Section"
- **Preview step** (linha ~541): remover o botão "Add Section" e todo o formulário `showAddSection` / `newSection`
- **Confirm step** (linha ~860): remover o botão "Add Section" que adiciona seção vazia
- Remover estados: `showAddSection`, `setShowAddSection`, `newSection`, `setNewSection`

### E2 — Remover ícone de olho (enable/disable section)
- **Preview step** (linha ~515): remover o `<Button>` com `Eye`/`EyeOff` de cada seção
- Remover o campo `enabled` do tipo de `previewSections`
- A prop `opacity-40` que aparece quando `!section.enabled` também deve ser removida

### E3 — Remover seção de "Auto-Generated Evaluation Criteria"
- **Preview step** (linhas ~594–661): remover o bloco inteiro da seção de criteria (heading, grid de criteria com eye toggle, botão "Add Criterion" e formulário `newCriterion`)
- **Confirm step** (linhas ~871–918): remover o card inteiro "Auto-Generated Criteria" (lista de criteria editáveis, botão "Add Criterion")
- Remover estados: `previewCriteria`, `setPreviewCriteria`, `showAddCriterion`, `setShowAddCriterion`, `newCriterion`, `setNewCriterion`, `confirmCriteria`, `setConfirmCriteria`
- Remover `criteria` do payload enviado para `POST /api/scripts`
- Remover `criteria` da interface `GeneratedScript`

### E4 — Fixar as 5 seções no confirm step
- No momento em que o script é gerado (`handleGenerate`) e `previewSections` é inicializado, **ignorar as seções retornadas pela IA** e sempre inicializar com as 5 seções fixas:
  ```typescript
  const FIXED_SECTIONS = [
    { name: 'Discovery', instructions: '', tips: '', weight: 20, critical: false },
    { name: 'Problem Agitation', instructions: '', tips: '', weight: 20, critical: false },
    { name: 'Offer Presentation', instructions: '', tips: '', weight: 20, critical: false },
    { name: 'Objection Handling', instructions: '', tips: '', weight: 20, critical: false },
    { name: 'Close & Next Steps', instructions: '', tips: '', weight: 20, critical: false },
  ]
  ```
- As `instructions` e `tips` podem ser preenchidas pelo conteúdo gerado pela IA (mapeando por nome de seção), mas a estrutura de 5 seções nunca muda
- No confirm step, o nome da seção **não é editável** (remover o `<Input>` de nome da seção — exibir apenas como texto fixo)
- Manter editáveis apenas: **Weight** (number input) e **Critical** (checkbox)
- Remover o botão de deletar seção (X) do confirm step, já que seções são fixas

**O que permanece editável no confirm step:**
| Campo | Editável |
|---|---|
| Nome do script | ✅ |
| Descrição do script | ✅ |
| Nome da seção | ❌ (fixo, só leitura) |
| Instructions da seção | ❌ (gerado pela IA, só leitura) |
| Tips da seção | ❌ (gerado pela IA, só leitura) |
| Weight da seção | ✅ |
| Critical da seção | ✅ |

**Arquivos críticos:**
- `app/[locale]/dashboard/script-builder/page.tsx` — único arquivo a modificar (todas as mudanças estão nele)

---

## TASK-F: Migração do Centurion (antigo → novo)

**Contexto:** "Centurion" foi mencionado como uma feature/módulo antigo que precisa ser migrado para o padrão atual do projeto.

---

## Ordem de implementação sugerida

| Ordem | Task | Dependências | Estimativa |
|---|---|---|---|
| 1 | **TASK-E** (Script Builder refactor) | Nenhuma | Médio |
| 2 | **TASK-C** (Intent) | Nenhuma | Médio |
| 3 | **TASK-B1/B2/B3** (Minutos nas calls e admin) | Nenhuma | Médio |
| 4 | **TASK-B4** (Histórico de cobranças) | B1 | Médio |
| 5 | **TASK-D** (Script Gap Detection) | Nenhuma | Grande |
| 6 | **TASK-A** (Stripe na LP) | Credenciais Stripe | Grande |
| 7 | **TASK-F** (Centurion) | Localizar código antigo | A definir |

---

## Verificação (como testar após implementação)

- **TASK-A**: Acessar `/` → clicar no botão de plano pago → deve redirecionar para Stripe Checkout real
- **TASK-B**: Acessar `/calls` como owner → ver coluna Duration com minutos (sem custo); acessar `/admin` → ver coluna Minutes + Cost na tabela de orgs no lugar de MRR; acessar `/admin/billing` como admin → ver tabela de cobranças por org; tentar acessar `/admin/billing` como owner → deve retornar 403
- **TASK-C**: Acessar `/calls` → ver coluna Intent com badge 1–5; acessar `/calls/[id]` → ver intent no header; enviar coaching email → receber seção de intent no corpo
- **TASK-D**: Acessar `/script-gap` como owner → ver lista de gaps; clicar "Accept Gap" → ver diff → confirmar → script atualizado apenas no trecho
- **TASK-E**: Abrir Script Builder → confirmar que não existe botão "Add Section", sem ícone de olho nas seções, sem seção de Evaluation Criteria; criar um script e verificar que as 5 seções fixas aparecem sempre; no confirm step, weight e critical são editáveis mas nome da seção é somente leitura
- **TASK-F**: A definir após localizar o código fonte
