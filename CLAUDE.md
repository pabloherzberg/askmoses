# AskMoses.AI — Contexto para Devs

Plataforma de Sales Coaching Intelligence. Contexto fictício: negócio de **adestramento de cães**.

**Fase 1 (atual):** Demo navegável de alta fidelidade. O objetivo é o Ariel apresentar ao vivo para prospects.

---

## REGRA OBRIGATÓRIA — Atualização de tasks

Sempre que uma task do `FASE1_TASK_BREAKDOWN.md` for concluída ou parcialmente concluída:
1. Atualizar os checkboxes (`- [ ]` → `- [x]`) dos critérios de aceite atingidos
2. Adicionar uma linha de status ao final da seção da task:
   - `> **STATUS: ✅ CONCLUÍDA**` — todos os critérios atingidos
   - `> **STATUS: 🟡 PARCIAL** — <o que falta>` — critérios parciais
3. Nunca deixar uma task feita sem atualizar o arquivo

---

## Regra de ouro — NÃO substituir o que já existe

O projeto já tem páginas funcionais herdadas do scaffold v0 (upload, history, analytics, insights, script-builder, settings, guide). Novas features da Fase 1 são **adicionadas ao lado** — nunca substituem páginas ou layouts existentes.

---

## Regra de ouro — Arquitetura de dados (MSW)

```
Frontend (fetch/hooks) → MSW intercepta no browser → retorna mock data
```

Usamos **MSW (Mock Service Worker)** para interceptar chamadas HTTP no frontend e retornar dados mockados. O frontend faz `fetch()` para as mesmas rotas que a API real terá na Fase 2 — o MSW intercepta e responde com dados fictícios.

**Vantagem:** quando a API real existir, basta desligar o MSW — o frontend já está chamando as rotas corretas.

```
✅ const res = await fetch('/api/calls')       // MSW intercepta e retorna mock
❌ import { calls } from '@/lib/mock-data'     // NUNCA importar direto no frontend
```

### Estrutura do MSW

```
lib/
  mock-data.ts             → Fonte ÚNICA de dados mock (trainers, calls, insights, etc.)
  mocks/
    handlers.ts            → Todos os request handlers (GET /api/calls, etc.)
    browser.ts             → setupWorker() — inicializa MSW no browser
    data/                  → Dados de resposta complexos dos handlers
      insights-analysis.ts → Resposta mock do POST /api/insights
      call-analysis.ts     → Resposta mock do POST /api/analyze + generate-script/criteria
```

### Regras do MSW

1. **Handlers definem as rotas da API futura** — usar os mesmos paths que a API real terá (`/api/calls`, `/api/trainers`, etc.)
2. **Formato de resposta padrão** — todos os handlers retornam `{ data: T, error: null }` ou `{ data: null, error: { message, code } }`
3. **MSW só roda em dev** — o worker é inicializado condicionalmente (`if (process.env.NODE_ENV === 'development')`)
4. **Dados mock de entidades ficam em `lib/mock-data.ts`** — fonte única, tipados com `lib/types.ts`. Dados de resposta complexos dos handlers (análises, scripts gerados) ficam em `lib/mocks/data/`
5. **O frontend usa `fetch()` normalmente** — não sabe que o MSW existe; quando a API real chegar, nada muda no frontend

---

## Stack — Fase 1

| Tecnologia | Papel |
|---|---|
| Next.js 16 App Router | Framework — Server Components + API Routes + Middleware |
| TypeScript strict | Linguagem — nenhum `any` implícito |
| Tailwind CSS | Estilização — usar os design tokens `--am-*` |
| shadcn/ui | Componentes base |
| Recharts | Gráficos |
| Supabase Auth | **Apenas auth** — sem banco de dados real nesta fase |
| MSW (Mock Service Worker) | Intercepta fetch no browser e retorna dados mock — simula a API real |

---

## Mapa de rotas — O que existe e o que estamos construindo

### Páginas públicas (sem login)

| Rota | Status | Descrição |
|---|---|---|
| `/` | ✅ Existe | Página de apresentação/proposta do produto |
| `/presentation` | ✅ Existe | Demo visual high-fidelity |
| `/tech` | ✅ Existe | Arquitetura técnica e roadmap |
| `/demobiz` | ✅ Existe | Demo de negócio "Dog Wizard HQ" |

### Dashboard operacional — `/dashboard/*` (já funcional, NÃO mexer)

Estas páginas já existem e funcionam com Supabase real. **Não alterar, não substituir.**

| Rota | Status | O que faz |
|---|---|---|
| `/dashboard` | ✅ Existe | Overview: stats, recent calls, quick links |
| `/dashboard/upload` | ✅ Existe | Upload áudio → transcrição → análise IA → email |
| `/dashboard/history` | ✅ Existe | Tabela de calls analisadas com busca |
| `/dashboard/analytics` | ✅ Existe | Tendências, heatmap, leaderboard |
| `/dashboard/insights` | ✅ Existe | Motor de insights IA por script |
| `/dashboard/script-builder` | ✅ Existe | Wizard 4 etapas para gerar scripts |
| `/dashboard/settings` | ✅ Existe | System prompt, modelo LLM, scripts |
| `/dashboard/guide` | ✅ Existe | Guia de uso + FAQ |

### Novas views da Fase 1 — **O QUE ESTAMOS CONSTRUINDO**

| Rota | Role | Status | Descrição |
|---|---|---|---|
| `/overview` | owner, admin | 🔨 Construir | **Visão executiva do time** — métricas, ranking, alertas, rubric, tendências, insights (baseada no `askmoses-dashboard.html`) |
| `/me` | trainer | 🔨 Construir | Dashboard pessoal do trainer — score, close rate, rubrica pessoal, dica de coaching, histórico |
| `/me/calls/[id]` | trainer | 🔨 Construir | Detalhe de call do trainer (sem notas de coaching) |
| `/calls` | owner, admin | 🔨 Construir | Tabela de calls do time com filtros |
| `/calls/[id]` | owner, admin | 🔨 Construir | Detalhe de call com notas de coaching |
| `/admin` | admin | 🔨 Construir | Painel SaaS: clientes, MRR, métricas globais |
| `/admin/rubric` | admin | 🔨 Construir | Config de rubrica (visual only na Fase 1) |
| `/login` | todos | ✅ Existe | Tela de login com shortcuts de demo |

---

## Os 3 níveis de acesso

| Role | Home (redirect após login) | Acessa | NÃO acessa |
|---|---|---|---|
| `trainer` | `/me` | `/me`, `/me/calls/[id]` | `/overview`, `/dashboard`, `/calls`, `/admin` |
| `owner` | `/overview` | `/overview`, `/dashboard/*`, `/calls`, `/calls/[id]` | `/admin` |
| `admin` | `/admin` | Tudo | — |

### Matriz de permissões

| Funcionalidade | Trainer | Owner | Admin |
|---|---|---|---|
| Ver suas próprias calls + score | ✅ | ✅ | ✅ |
| Ver calls de todo o time | ❌ | ✅ | ✅ |
| Ranking, alertas, insights do time | ❌ | ✅ | ✅ |
| Upload/análise de calls | ❌ | ✅ | ✅ |
| Config de rubrica/scripts | ❌ | ✅ | ✅ |
| Painel SaaS (clientes, MRR) | ❌ | ❌ | ✅ |

### Logins de demo

| Email | Senha | Role | Redireciona |
|---|---|---|---|
| `trainer@demo.askmoses.ai` | `demo123` | trainer | `/me` |
| `owner@demo.askmoses.ai` | `demo123` | owner | `/overview` |
| `admin@askmoses.ai` | `demo123` | admin | `/admin` |

### Regras de proteção (middleware.ts)

- Sem sessão em rota protegida → `/login`
- Rotas públicas (`/`, `/presentation`, `/tech`, `/demobiz`) → acesso livre
- Trainer → `/overview`, `/dashboard`, `/calls`, `/admin` → redireciona para `/me`
- Owner → `/admin` → redireciona para `/overview`

---

## Estrutura de pastas

```
app/
  page.tsx                   → Página de apresentação (pública)
  (auth)/login/              → Tela de login
  (trainer)/me/              → Dashboard pessoal do trainer
  (trainer)/me/calls/[id]/   → Detalhe de call (visão trainer)
  overview/                  → Visão executiva do gestor (NOVA — baseada no HTML)
  calls/                     → Tabela de calls do time (NOVA)
  calls/[id]/                → Detalhe de call (visão gestor)
  dashboard/                 → Dashboard operacional (JÁ EXISTE — não mexer)
  dashboard/upload/          → Upload de calls (já existe)
  dashboard/history/         → Histórico (já existe)
  dashboard/analytics/       → Analytics (já existe)
  dashboard/insights/        → Insights IA (já existe)
  dashboard/script-builder/  → Script builder (já existe)
  dashboard/settings/        → Config rubrica (já existe)
  dashboard/guide/           → Guia de uso (já existe)
  (admin)/admin/             → Painel SaaS
  (admin)/admin/rubric/      → Config de rubrica (admin)
  presentation/              → Demo visual (pública)
  tech/                      → Arquitetura (pública)
  demobiz/                   → Demo negócio (pública)
lib/
  types.ts                   → Tipos TypeScript
  mock-data.ts               → Fonte ÚNICA de dados fictícios (trainers, calls, insights, etc.)
  auth.ts                    → getSession(), getRole(), redirectByRole(), ok(), unauthorized()...
  supabase/server.ts         → Client Supabase server-side
  supabase/client.ts         → Client Supabase browser-side
  mocks/
    handlers.ts              → MSW request handlers — importam de mock-data.ts
    browser.ts               → setupWorker() para inicializar MSW no browser

components/
  dashboard/                 → Sidebar e header do dashboard existente (NÃO mexer)
  layout/                    → AppHeader, OwnerSidebar, TrainerSidebar, AdminSidebar (novas views)
  shared/                    → Componentes reutilizáveis (ScoreCard, RubricBar, ScorePill, etc.)
```

---

## Design Tokens

Sempre usar variáveis CSS `--am-*` — nunca hex codes direto nos componentes.

```css
--am-bg:      #0D0F14    /* Fundo principal — body */
--am-bg2:     #13161D    /* Cards, header */
--am-bg3:     #1A1E28    /* Items secundários, alerts */
--am-bg4:     #222736    /* Tracks de barras, badges */
--am-text:    #F0F2F8    /* Texto principal */
--am-muted:   #7A849A    /* Labels, subtextos */
--am-accent:  #6E56FF    /* Roxo principal */
--am-accent2: #9B87FF    /* Roxo claro */
--am-green:   #22D9A0    /* Sucesso, positivo */
--am-red:     #FF5E5E    /* Alerta, negativo */
--am-amber:   #FFAB2E    /* Aviso */
--am-blue:    #5EB3FF    /* Informação */
```

Fontes: **DM Sans** (texto) + **DM Mono** (números, badges, código)

**ScorePill:** >= 85 → verde | 75–84 → âmbar | < 75 → vermelho

---

## Entidades de dados (lib/mocks/data/)

| Entidade | Campos principais |
|---|---|
| `Trainer` | id, name, avatar, avatarColor, totalCalls, closeRate, closeDelta, score, lastActive |
| `Call` | id, trainerId, date, score, result, prospect, rubricScores, strengths[], improvements[], transcript |
| `RubricSection` | id, name, weight, isCritical, teamAvg, trainerScores, color |
| `Insight` | id, type, icon, title, tag, tagColor, summary, action |
| `Client` | id, name, plan, callsThisMonth, avgScore, mrr, health |
| `TrendPoint` | week, closeRate, score |

**4 trainers:** Marcus R. (91), Jamie L. (87), Jordan K. (79), Taylor M. (74)
**5 seções da rubrica:** Discovery · Problem Agitation · Offer Presentation · Objection Handling · Close & Next Steps

---

## Formato padrão de resposta (MSW handlers)

```typescript
// Sucesso
{ data: T, error: null }

// Erro
{ data: null, error: { message: string, code: number } }
```

401 se sem sessão, 403 se role não autorizado, 404 se recurso não encontrado.

---

## O que está FORA do escopo da Fase 1

Não implementar nada disso agora:
- IA real (Whisper, GPT-4o)
- Upload de áudio nas novas views
- Supabase como banco de dados (apenas Auth)
- E-mail de coaching (Resend)
- Redis / cache
- Webhooks (Twilio, GHL, Fathom)
- Funcionalidades que persistem dados (qualquer POST/PUT que não seja auth)

---

## Referências visuais

- `askmoses-dashboard.html` — especificação visual da tela `/overview` (visão executiva do gestor). Usar como referência de design, não como substituto de páginas existentes.
- `AskMoses_Levantamento_Tecnico_v3.pdf` — levantamento técnico completo do projeto.
- `FASE1_TASK_BREAKDOWN.md` — tasks detalhadas com critérios de aceite. **Manter atualizado.**
