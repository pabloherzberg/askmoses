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

## Regra de ouro — Arquitetura de dados

```
Frontend → /app/api/ → /lib/services/ → /lib/mock-data.ts
```

**O frontend NUNCA importa `mock-data.ts` diretamente.** Todo acesso a dados passa pelo service layer. Isso garante que na Fase 2 apenas os services mudam — nada no frontend quebra.

```
❌ import { calls } from '@/lib/mock-data'   // em um componente React
✅ const res = await fetch('/api/calls')       // sempre via API Route
```

Os services são todos `async` mesmo retornando mock. Não remova o `async`.

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
| `/lib/mock-data.ts` | Fonte única de dados fictícios para as novas views |

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
  api/calls/                 → GET /api/calls
  api/calls/[id]/            → GET /api/calls/:id
  api/trainers/              → GET /api/trainers
  api/insights/              → GET /api/insights
  api/clients/               → GET /api/clients (admin only)
  api/rubric/                → GET /api/rubric

lib/
  mock-data.ts               → Dados fictícios para as novas views
  types.ts                   → Tipos TypeScript
  auth.ts                    → getSession(), getRole(), redirectByRole(), ok(), unauthorized()...
  supabase/server.ts         → Client Supabase server-side
  supabase/client.ts         → Client Supabase browser-side
  services/                  → Service layer (async, retorna mock na Fase 1)

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

## Entidades de dados (mock-data.ts)

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

## Formato padrão de resposta das API Routes (novas)

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
