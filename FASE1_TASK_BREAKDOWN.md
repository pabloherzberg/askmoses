# AskMoses.AI — Fase 1: Task Breakdown
> Versão 2.0 · 24/03/2026 · Net Midas para AskMoses.AI

---

## Contexto essencial

**O que é esta fase**: Demo navegável de alta fidelidade para o Ariel apresentar ao vivo para prospects.

**O que JÁ EXISTE no projeto**: Dashboard operacional completo em `/dashboard/*` (upload, history, analytics, insights, script-builder, settings, guide) + páginas públicas (`/`, `/presentation`, `/tech`, `/demobiz`). **Não mexer nestas páginas.**

**O que estamos construindo**: Novas views por nível de acesso (`/overview`, `/me`, `/calls`, `/admin`) usando dados mockados e o design system AskMoses (dark theme com tokens `--am-*`).

**Referência visual**: `askmoses-dashboard.html` define o design da tela `/overview` (visão executiva). Usar como guia de design, **não como substituto** de páginas existentes.

---

## Arquitetura de rotas — Visão geral

```
Públicas (sem login):
  /                    → Apresentação do produto
  /presentation        → Demo visual
  /tech                → Arquitetura técnica
  /demobiz             → Demo de negócio

Após login — por role:
  TRAINER → /me                        (home)
            /me/calls/[id]             (detalhe da call)

  OWNER   → /overview                  (home — visão executiva do time)
            /calls                     (tabela de calls do time)
            /calls/[id]                (detalhe com notas de coaching)
            /dashboard/*               (ferramentas operacionais — já existem)

  ADMIN   → /admin                     (home — painel SaaS)
            /admin/rubric              (config de rubrica)
            + acesso a tudo do owner
```

### Middleware — regras de redirect

| Situação | Ação |
|---|---|
| Sem sessão em rota protegida | → `/login` |
| Trainer acessando `/overview`, `/dashboard`, `/calls`, `/admin` | → `/me` |
| Owner acessando `/admin` | → `/overview` |
| Owner login | → `/overview` |
| Trainer login | → `/me` |
| Admin login | → `/admin` |

---

# ÉPICO 0 — Setup & Infraestrutura

---

## TASK-001 — Inicializar projeto Next.js

**Tipo**: Setup · **Responsável**: Dev líder

### Critérios de aceite
- [x] `npm run dev` roda sem erros
- [x] TypeScript strict mode ativo
- [x] Tailwind + shadcn/ui funcionando
- [x] Commit inicial com estrutura base

> **STATUS: ✅ CONCLUÍDA** — Projeto inicializado (v0 scaffold + deps)

---

## TASK-002 — Configurar Design Tokens

**Tipo**: Setup / Design · **Depende de**: TASK-001

### Critérios de aceite
- [x] Variáveis CSS `--am-*` definidas em `globals.css`
- [ ] Fontes DM Sans e DM Mono carregando via next/font
- [x] Background padrão das novas views usa `--am-bg`

> **STATUS: 🟡 PARCIAL** — Tokens CSS adicionados. Falta: carregar fontes DM Sans/DM Mono via next/font.

---

## TASK-003 — Configurar Supabase Auth

**Tipo**: Infraestrutura · **Depende de**: TASK-001

### Critérios de aceite
- [x] Projeto Supabase criado e acessível
- [x] Tabela `profiles` criada com trigger `set_role_claim`
- [x] `lib/supabase/server.ts` e `lib/supabase/client.ts` configurados
- [x] `.env.local` com variáveis reais (não commitado)
- [x] `.env.example` commitado com chaves sem valores

> **STATUS: ✅ CONCLUÍDA**

---

## TASK-004 — Criar os 3 usuários demo no Supabase

**Tipo**: Configuração · **Depende de**: TASK-003

### Critérios de aceite
- [x] 3 usuários criados no Supabase Auth
- [x] Cada usuário tem registro correspondente em `profiles`
- [x] JWT de cada usuário contém `app_metadata.role` correto
- [ ] Login manual funciona para cada um dos 3

> **STATUS: ✅ CONCLUÍDA** — Criados via `scripts/setup-supabase.mjs`. IDs: trainer=d086ee67, owner=19717dfd, admin=90577096. Falta testar login na UI.

---

## TASK-005 — Criar `/lib/mock-data.ts` e `/lib/types.ts`

**Tipo**: Data · **Depende de**: TASK-001

### Critérios de aceite
- [x] `/lib/types.ts` com todos os tipos exportados
- [x] `/lib/mock-data.ts` com todas as entidades
- [x] 4 trainers, 21 calls, 5 rubric sections, 4 insights, 3 clients, 6 trend points
- [x] Contexto de dog training nos dados

> **STATUS: ✅ CONCLUÍDA**

---

## TASK-006 — Criar Service Layer (`/lib/services/`)

**Tipo**: Backend · **Depende de**: TASK-005

### Critérios de aceite
- [x] 5 services criados (calls, trainers, insights, clients, rubric), todos `async`
- [x] Zero imports de `mock-data.ts` fora de `/lib/services/`
- [x] Lógica de filtragem por role em `getCalls`

> **STATUS: ✅ CONCLUÍDA**

---

## TASK-007 — Criar API Routes (`/app/api/`)

**Tipo**: Backend · **Depende de**: TASK-006

### Critérios de aceite
- [x] Endpoints: `/api/calls`, `/api/calls/[id]`, `/api/trainers`, `/api/insights`, `/api/clients`, `/api/rubric`
- [x] 401 sem sessão, 403 role não autorizado, 404 recurso não encontrado
- [x] Formato `{ data, error }` consistente

> **STATUS: ✅ CONCLUÍDA**

---

## TASK-008 — Criar `middleware.ts`

**Tipo**: Backend / Auth · **Depende de**: TASK-003

### Descrição
Middleware intercepta requisições, lê JWT, redireciona por role. Rotas públicas (`/`, `/presentation`, `/tech`, `/demobiz`, `/login`) passam direto.

### Critérios de aceite
- [x] Sem sessão em rota protegida → `/login`
- [x] Rotas públicas acessíveis sem login
- [x] Trainer acessando `/overview`, `/dashboard`, `/calls`, `/admin` → `/me`
- [x] Owner acessando `/admin` → `/overview`
- [x] Owner login → `/overview` (em vez de `/dashboard`)
- [x] Assets estáticos e `/api/` não interceptados

> **STATUS: ✅ CONCLUÍDA** — Middleware refatorado para usar cookie `demo-role` (MSW). Todos os redirects por role corretos.

---

## TASK-009 — Criar `/lib/auth.ts`

**Tipo**: Backend / Auth · **Depende de**: TASK-003

### Critérios de aceite
- [x] `getSession()`, `getRole()`, `getUserId()` funcionam via JWT
- [x] `redirectByRole()` retorna rota correta por role
- [x] Helpers `unauthorized()`, `forbidden()`, `notFound()`, `ok()`

> **STATUS: ✅ CONCLUÍDA** — `redirectByRole` atualizado: owner → `/overview`, admin → `/admin`, trainer → `/me`. Também inclui sessão demo via cookie.

---

## TASK-010 — Tela de Login (`/login`)

**Tipo**: Frontend / Auth · **Depende de**: TASK-003, TASK-004

### Critérios de aceite
- [x] Login funciona com os 3 emails de demo
- [x] Erro exibido para credenciais inválidas
- [x] 3 demo shortcuts preenchem o form automaticamente
- [x] Após login, redireciona para rota correta do role
- [x] Visual dark com identidade AskMoses

> **STATUS: ✅ CONCLUÍDA** — Login refatorado para usar `fetch('/api/auth/login')` via MSW. Cookie `demo-role` persiste sessão. Owner redireciona para `/overview`.

---

## TASK-011 — Criar componentes base reutilizáveis

**Tipo**: Frontend · **Depende de**: TASK-002

### Componentes em `/components/shared/`

| Componente | Descrição |
|---|---|
| `RubricBar.tsx` | Barra de progresso por seção (CSS transition 1s) |
| `ScoreCard.tsx` | Card de métrica com delta |
| `InsightCard.tsx` | Card de insight com tag, hover effect (`'use client'`) |
| `TrainerAvatar.tsx` | Avatar circular com iniciais |
| `ScorePill.tsx` | Badge score (>=85 verde, 75-84 âmbar, <75 vermelho) |
| `AlertItem.tsx` | Item de alerta com dot colorido (`'use client'`) |
| `SectionLabel.tsx` | Label de seção uppercase |

### Critérios de aceite
- [x] 7 componentes criados e exportados
- [x] Props TypeScript sem `any`
- [x] Componentes com event handlers têm `'use client'`
- [x] Todos usam variáveis CSS `--am-*`

> **STATUS: ✅ CONCLUÍDA**

---

## TASK-012 — Criar layouts e sidebars para as novas views

**Tipo**: Frontend · **Depende de**: TASK-002, TASK-009

### Descrição
Layouts independentes para cada grupo de rotas. **NÃO alterar** o layout e sidebar existentes em `components/dashboard/` e `app/dashboard/layout.tsx`.

### Componentes em `/components/layout/`

| Componente | Usa em |
|---|---|
| `AppHeader.tsx` | Header com logo AskMoses, badge semana, dot live, logout |
| `OwnerSidebar.tsx` | `/overview`, `/calls` — links: Overview, Calls, Dashboard (link para `/dashboard`) |
| `TrainerSidebar.tsx` | `/me` — links: Meu Dashboard |
| `AdminSidebar.tsx` | `/admin` — links: Painel SaaS, Config Rubrica |

### Critérios de aceite
- [x] AppHeader com logout funcional
- [x] 3 sidebars criadas
- [ ] Mobile: sidebar como Sheet/Drawer
- [x] Layouts `(auth)`, `(trainer)`, `(admin)` criados
- [ ] Layout para `/overview` e `/calls` criado (usa OwnerSidebar + AppHeader)

> **STATUS: 🟡 PARCIAL** — Componentes criados. Falta: mobile Sheet/Drawer, layout do overview/calls.

---

---

# ÉPICO 1 — Nível 2: Visão Executiva do Gestor *(Prioridade máxima)*

---

## TASK-013 — Tela `/overview` — Visão executiva do time

**Tipo**: Frontend · **Depende de**: TASK-007, TASK-011, TASK-012
**Prioridade**: CRÍTICA — é a tela central da demo

### Descrição
Página NOVA em `/overview` (NÃO em `/dashboard`). Usa dados mockados via service layer. Referência visual: `askmoses-dashboard.html`.

### Seções (de cima para baixo)

**1. "Visão geral da equipe"** — 4 ScoreCards em grid
- Close rate médio: 64% ↑ +7pts
- Score médio: 83 ↑ +11pts
- Total de calls: 83 (4 trainers ativos)
- Melhor close rate: 74% (Marcus R.)

**2. Grid principal** — 2 colunas
- Esquerda: Ranking de trainers (avatar, nome, close%, delta, ScorePill)
- Direita: Alertas ativos (4 AlertItems)

**3. Grid de gráficos** — 2 colunas
- Esquerda: Rubric por seção (5 RubricBars com média da equipe)
- Direita: Tendência 6 semanas (Recharts LineChart)

**4. Tabela de rubric detalhada**
- Colunas: Seção | Equipe | Marcus R. | Jamie L. | Jordan K. | Taylor M.
- Highlight verde no maior por linha, vermelho em valores <65

**5. Insights de IA** — 2x2 grid de InsightCards

### Dados (via service layer, NÃO via fetch)
```typescript
const [trainers, stats, insights, rubric, trend] = await Promise.all([
  getTrainers(), getTeamStats(), getInsights(), getRubricSections(), getTrendData(),
])
```

### Critérios de aceite
- [ ] Rota `/overview` existe e renderiza
- [ ] Layout usa OwnerSidebar + AppHeader
- [ ] Visual próximo ao HTML de referência
- [ ] 4 metric cards com animação fadeUp
- [ ] Ranking ordenado por score decrescente
- [ ] 4 alertas com cores corretas
- [ ] Barras de rubrica com animação CSS transition 1s
- [ ] Gráfico renderizando com tooltip funcional
- [ ] Tabela com highlight verde/vermelho
- [ ] 4 cards de insight com hover effect
- [ ] Responsivo: colapsa em tablet/mobile

---

## TASK-014 — Tela `/calls` — Tabela de calls do gestor

**Tipo**: Frontend · **Depende de**: TASK-007, TASK-011, TASK-012

### Descrição
Listagem de TODAS as calls do time com filtros client-side.

### Elementos
- **Filtros**: Dropdown Trainer (todos/individual) + Dropdown Resultado (todos/closed/no-close/follow-up)
- **Tabela**: Avatar+Nome | Prospect | Data | Duração | ScorePill | Badge resultado | →
- **Badge resultado**: closed=verde, no-close=vermelho, follow-up=âmbar
- **Linha clicável** → `/calls/[id]`
- **Estado vazio**: ícone + "Nenhuma call encontrada"

### Critérios de aceite
- [ ] Tabela lista todas as calls (21+)
- [ ] Filtro por trainer funciona
- [ ] Filtro por resultado funciona
- [ ] Badge de resultado com cor correta
- [ ] Clicar na linha navega para `/calls/[id]`
- [ ] Estado vazio quando filtros não retornam resultado

---

## TASK-015 — Componente `CallDetail.tsx` + rotas de detalhe

**Tipo**: Frontend · **Depende de**: TASK-007, TASK-011

### Descrição
Componente reutilizado por gestor E trainer. Comportamento muda conforme `viewerRole`.

### Props
```tsx
interface CallDetailProps {
  call: Call
  viewerRole: 'trainer' | 'owner' | 'admin'
}
```

### Layout
- Score em destaque (grande, colorido)
- Badge de resultado
- 5 RubricBars com scores individuais da call
- Pontos fortes (check verde)
- Pontos de melhoria (arrow âmbar)
- Trecho da transcrição (fonte mono, truncado com "ver mais")
- Campo de notas de coaching (apenas owner/admin — não persiste na Fase 1)

### Rotas que usam este componente
- `/calls/[id]` — `viewerRole="owner"` (gestor vê notas)
- `/me/calls/[id]` — `viewerRole="trainer"` (trainer não vê notas)

### Critérios de aceite
- [ ] Score colorido conforme valor
- [ ] RubricBars com valores individuais (não da equipe)
- [ ] Strengths com check verde, improvements com arrow âmbar
- [ ] Transcrição em fonte mono
- [ ] Notas de coaching visível apenas para owner/admin
- [ ] 403 se trainer tenta acessar call de outro trainer

---

---

# ÉPICO 2 — Nível 1: Dashboard do Trainer

---

## TASK-016 — Tela `/me` — Dashboard pessoal do trainer

**Tipo**: Frontend · **Depende de**: TASK-007, TASK-011, TASK-012

### Descrição
Dashboard pessoal com foco em melhoria individual. Tom motivacional. Trainer vê APENAS seus próprios dados.

### Elementos
1. **Saudação**: "Olá, Marcus R. · Semana 6 de 6"
2. **Métricas pessoais**: Score 91 (accent2) + Close rate 74% (green) com deltas
3. **Rubrica pessoal**: 5 barras com delta vs. média do time (verde se acima, vermelho se abaixo)
4. **Dica de coaching**: Card com borda accent-left
5. **Histórico**: Últimas 5-6 calls, clicável → `/me/calls/[id]`

### Critérios de aceite
- [ ] Trainer vê APENAS suas próprias calls
- [ ] Score e close rate com delta colorido
- [ ] Barras de rubrica com delta vs. média do time
- [ ] Dica de coaching com visual accent-border
- [ ] Lista de calls com link para detalhe

---

## TASK-017 — Tela `/me/calls/[id]` — Detalhe de call do trainer

**Tipo**: Frontend · **Depende de**: TASK-015

### Critérios de aceite
- [ ] Rota `/me/calls/[id]` funcional
- [ ] Renderiza `CallDetail` com `viewerRole="trainer"` (sem notas)
- [ ] 403 se call não pertence ao trainer

---

---

# ÉPICO 3 — Nível 3: Admin Panel

---

## TASK-018 — Tela `/admin` — Painel SaaS

**Tipo**: Frontend · **Depende de**: TASK-007, TASK-011, TASK-012

### Elementos
1. **Métricas globais**: 4 ScoreCards (Total clientes: 3, Calls/mês: 247, MRR: R$1.491, Score médio: 81)
2. **Tabela de clientes**: Nome | Plano | Calls/mês | Score | MRR | Health badge
3. **Health badge**: healthy=verde "Saudável", at-risk=âmbar "Em Risco", churning=vermelho "Crítico"

### Critérios de aceite
- [ ] 4 metric cards com dados globais
- [ ] Tabela com 3 clientes
- [ ] Health badge com cores corretas
- [ ] Acessível apenas para role `admin`

---

## TASK-019 — Tela `/admin/rubric` — Config de rubrica

**Tipo**: Frontend · **Depende de**: TASK-005, TASK-012

### Elementos
1. **5 seções** em cards com nome, peso, descrição, toggle "Crítico/Opcional" (visual only)
2. **Preview de prompt IA** em textarea readonly
3. **Botão "Salvar"** → toast "Funcionalidade disponível em breve"

### Critérios de aceite
- [ ] 5 seções listadas
- [ ] Toggle visual (não persiste)
- [ ] Botão salvar exibe toast
- [ ] Acessível apenas para `admin`

---

---

# ÉPICO 4 — Polish, Deploy & Entrega

---

## TASK-020 — Loading states e estados vazios

**Tipo**: Frontend / UX · **Depende de**: TASK-013, TASK-014, TASK-016, TASK-018

### Critérios de aceite
- [ ] `loading.tsx` para: `/overview`, `/calls`, `/me`, `/admin`
- [ ] Skeletons com `animate-pulse` e layout aproximado
- [ ] Estado vazio nas tabelas de calls
- [ ] Sem erro de hydration no console

---

## TASK-021 — Responsividade mobile (viewport 375px)

**Tipo**: Frontend / CSS · **Depende de**: TASK-013, TASK-016, TASK-018

### Critérios de aceite
- [ ] Viewport 375px: sem scroll horizontal indesejado
- [ ] Grids colapsam corretamente
- [ ] Sidebar como Sheet/Drawer em mobile
- [ ] Tabelas com scroll horizontal quando necessário

---

## TASK-022 — Deploy no Vercel

**Tipo**: DevOps · **Depende de**: Todas as tasks anteriores

### Critérios de aceite
- [ ] `npm run build` passa sem erros
- [ ] URL pública acessível
- [ ] Variáveis de ambiente corretas em produção
- [ ] Os 3 logins de demo funcionam em produção

---

## TASK-023 — Testes do fluxo completo + `DEMO_ACCESS.md`

**Tipo**: QA · **Depende de**: TASK-022

### Script de teste

```
1. Abrir URL em aba anônima

2. Verificar que / mostra a página de apresentação do produto

3. [OWNER] Login com owner@demo.askmoses.ai / demo123
   ✓ Redireciona para /overview
   ✓ Vê métricas, ranking, alertas, rubric, gráfico, insights
   ✓ Navega para /calls → tabela de calls do time
   ✓ Clica em call → detalhe com notas de coaching
   ✓ Navega para /dashboard → dashboard operacional (upload, history, etc.)
   ✓ Tentar /admin → redireciona para /overview
   → Logout

4. [TRAINER] Login com trainer@demo.askmoses.ai / demo123
   ✓ Redireciona para /me
   ✓ Vê score pessoal, close rate, rubrica pessoal, dica
   ✓ Clica em call → /me/calls/[id] sem notas de coaching
   ✓ Tentar /overview → redireciona para /me
   ✓ Tentar /dashboard → redireciona para /me
   → Logout

5. [ADMIN] Login com admin@askmoses.ai / demo123
   ✓ Redireciona para /admin
   ✓ Vê métricas globais e tabela de clientes
   ✓ Navega para /admin/rubric → config visual
   ✓ Acessa /overview → funciona (admin vê tudo)
   ✓ Acessa /dashboard → funciona
   → Logout
```

### Critérios de aceite
- [ ] Todos os checks acima passam sem erro
- [ ] Nenhum 404, loop de redirect ou erro de console
- [ ] `DEMO_ACCESS.md` criado com logins e script de demo

---

# Resumo de Status

| Task | Descrição | Status |
|---|---|---|
| TASK-001 | Setup Next.js | ✅ |
| TASK-002 | Design Tokens | 🟡 Falta fontes DM Sans/Mono |
| TASK-003 | Supabase Auth | ✅ |
| TASK-004 | Usuários demo | ✅ |
| TASK-005 | Mock data + types | ✅ |
| TASK-006 | Service layer | ✅ |
| TASK-007 | API Routes | ✅ |
| TASK-008 | Middleware | ✅ |
| TASK-009 | Auth helpers | ✅ |
| TASK-010 | Login page | ✅ |
| TASK-011 | Componentes shared | ✅ |
| TASK-012 | Layouts/sidebars | 🟡 Falta mobile + layout overview |
| TASK-013 | `/overview` | ⬜ Não iniciada |
| TASK-014 | `/calls` | ⬜ Não iniciada |
| TASK-015 | `CallDetail` + rotas | ⬜ Não iniciada |
| TASK-016 | `/me` | ⬜ Não iniciada |
| TASK-017 | `/me/calls/[id]` | ⬜ Não iniciada |
| TASK-018 | `/admin` | ⬜ Não iniciada |
| TASK-019 | `/admin/rubric` | ⬜ Não iniciada |
| TASK-020 | Loading states | ⬜ Não iniciada |
| TASK-021 | Responsividade | ⬜ Não iniciada |
| TASK-022 | Deploy Vercel | ⬜ Não iniciada |
| TASK-023 | QA + DEMO_ACCESS | ⬜ Não iniciada |

---

*Documento atualizado em 24/03/2026 · Net Midas para AskMoses.AI · Fase 1 v2.0*
