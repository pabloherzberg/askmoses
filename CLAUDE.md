# AskMoses.AI — Contexto para Devs

Plataforma de Sales Coaching Intelligence. Contexto fictício: negócio de **adestramento de cães**.

**Fase 1 (atual):** Demo navegável de alta fidelidade. Sem IA real, sem upload de áudio, sem banco de dados real. O objetivo é o Ariel apresentar ao vivo para prospects.

---

## Regra de ouro da arquitetura

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
| Next.js 14 App Router | Framework — Server Components + API Routes + Middleware |
| TypeScript strict | Linguagem — nenhum `any` implícito |
| Tailwind CSS | Estilização — usar os tokens definidos abaixo |
| shadcn/ui | Componentes base |
| Recharts | Gráficos |
| Supabase Auth | **Apenas auth** — sem banco de dados real nesta fase |
| `/lib/mock-data.ts` | Fonte única de todos os dados fictícios |

---

## Estrutura de pastas

```
app/
  (auth)/login/          → Tela de login
  (trainer)/me/          → Nível 1: dashboard pessoal do trainer
  (trainer)/me/calls/[id]/
  (owner)/dashboard/     → Nível 2: visão do time (gestor)
  (owner)/calls/
  (owner)/calls/[id]/
  (admin)/admin/         → Nível 3: painel SaaS (equipe AskMoses)
  (admin)/admin/rubric/
  api/calls/             → GET /api/calls
  api/calls/[id]/        → GET /api/calls/:id
  api/trainers/          → GET /api/trainers
  api/insights/          → GET /api/insights
  api/clients/           → GET /api/clients (admin only)

lib/
  mock-data.ts           → ÚNICA fonte de dados da Fase 1
  types.ts               → Todos os tipos TypeScript
  auth.ts                → getSession(), getRole(), requireRole(), redirectByRole()
  supabase.ts            → Clients configurados (server + browser)
  services/
    calls.service.ts
    trainers.service.ts
    insights.service.ts
    clients.service.ts
    rubric.service.ts

components/
  shared/
    RubricBar.tsx        → Barra de progresso por seção (com animação CSS obrigatória)
    ScoreCard.tsx        → Card de métrica com delta
    InsightCard.tsx      → Card de insight de IA
    TrainerAvatar.tsx    → Avatar circular com iniciais
    ScorePill.tsx        → Badge de score (verde/âmbar/vermelho automático)
    AlertItem.tsx        → Item de alerta com dot colorido

middleware.ts            → Proteção de rotas por role (lê JWT, sem chamada ao banco)
```

---

## Os 3 níveis de acesso

| Role | Rota | Vê |
|---|---|---|
| `trainer` | `/me` | Apenas suas próprias calls e score pessoal |
| `owner` | `/dashboard` | Visão completa do time, ranking, alertas, insights |
| `admin` | `/admin` | Painel SaaS: todos os clientes, MRR, config de rubrica |

**Logins de demo:**
- `trainer@demo.askmoses.ai` / `demo123` → `/me` (Marcus R.)
- `owner@demo.askmoses.ai` / `demo123` → `/dashboard`
- `admin@askmoses.ai` / `demo123` → `/admin`

**Regras de proteção (middleware.ts):**
- Trainer tentando acessar `/dashboard` → redireciona para `/me`
- Owner/Trainer tentando acessar `/admin` → redireciona para `/dashboard`
- Sem sessão → redireciona para `/login`

---

## Design Tokens

Sempre usar variáveis CSS ou classes Tailwind mapeadas — nunca hex codes direto nos componentes.

```css
--bg: #0D0F14          /* Fundo principal — body */
--bg2: #13161D         /* Cards, header */
--bg3: #1A1E28         /* Items secundários, alerts */
--bg4: #222736         /* Tracks de barras, badges */
--text: #F0F2F8        /* Texto principal */
--muted: #7A849A       /* Labels, subtextos */
--accent: #6E56FF      /* Roxo principal */
--accent2: #9B87FF     /* Roxo claro */
--green: #22D9A0       /* Sucesso, positivo */
--red: #FF5E5E         /* Alerta, negativo */
--amber: #FFAB2E       /* Aviso */
--blue: #5EB3FF        /* Informação */
```

Fontes: **DM Sans** (texto corrido) + **DM Mono** (números, badges, código)

**ScorePill:** ≥ 85 → verde | 75–84 → âmbar | < 75 → vermelho

---

## Entidades de dados (mock-data.ts)

| Entidade | Campos principais |
|---|---|
| `Trainer` | id, name, avatar, avatarColor, totalCalls, closeRate, closeDelta, score, lastActive |
| `Call` | id, trainerId, date, score, result, prospect, rubricScores, strengths[], improvements[], transcript |
| `RubricSection` | id, name, weight, isCritical, teamAvg, color |
| `Insight` | id, type, icon, title, tag, tagColor, summary, action |
| `Client` | id, name, plan, callsThisMonth, avgScore, mrr, health |
| `TrendPoint` | week, closeRate, score |

**4 trainers:** Marcus R. (91), Jamie L. (87), Jordan K. (79), Taylor M. (74)
**5 seções da rubrica:** Discovery · Problem Agitation · Offer Presentation · Objection Handling · Close & Next Steps

---

## Formato padrão de resposta das API Routes

```typescript
// Sucesso
{ data: T, error: null }

// Erro
{ data: null, error: { message: string, code: number } }
```

Retornar 401 se sem sessão, 403 se role não autorizado, 404 se recurso não encontrado.

---

## O que está FORA do escopo da Fase 1

Não implementar nada disso agora:
- IA real (Whisper, GPT-4o)
- Upload de áudio
- Supabase como banco de dados (apenas Auth)
- E-mail de coaching (Resend)
- Redis / cache
- Webhooks (Twilio, GHL, Fathom)
- Funcionalidades que persistem dados (qualquer POST/PUT que não seja auth)

---

## Referências visuais

- `askmoses-dashboard.html` — especificação visual exata da tela `/dashboard` (Nível 2 — Gestor). Seguir pixel-a-pixel.
- `AskMoses_Levantamento_Tecnico_v3.pdf` — levantamento técnico completo do projeto.
- `FASE1_TASK_BREAKDOWN.md` — 23 tasks detalhadas com critérios de aceite.
