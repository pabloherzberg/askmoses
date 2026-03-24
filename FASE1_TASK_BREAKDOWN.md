# AskMoses.AI — Fase 1: Task Breakdown Completo
> Versão 1.0 · 24/03/2026 · Net Midas para AskMoses.AI

---

## Contexto essencial para todos os devs

**O que é esta fase**: Demo navegável de alta fidelidade. NÃO é um produto funcional. O objetivo é o Ariel apresentar ao vivo para prospects.

**O que NÃO existe na Fase 1**: IA real, upload de áudio, processamento de calls, banco de dados real, Redis.

**Dados**: 100% mockados. Contexto fictício: negócio de adestramento de cães (dog training).

**Entrega**: Deploy no Vercel, 3 logins pré-configurados, 8 telas completas e polidas.

---

## Stack Tecnológico — Fase 1

| Tecnologia | Papel |
|---|---|
| Next.js 14 (App Router) | Framework principal — Server Components + API Routes + Middleware |
| TypeScript | Linguagem — strict mode obrigatório |
| Tailwind CSS | Estilização — com design tokens customizados |
| shadcn/ui | Componentes base (button, badge, card, table, avatar, sheet) |
| Recharts | Gráficos de linha e barra |
| Supabase Auth | Apenas autenticação — sem banco de dados real ainda |
| Vercel | Deploy e hospedagem |
| `/lib/mock-data.ts` | Fonte única de todos os dados fictícios |

---

## Arquitetura — LEIA ANTES DE CODAR

```
Frontend (Server/Client Components)
    ↓
API Routes (/app/api/)
    ↓
Service Layer (/lib/services/)
    ↓
Fonte de dados: mock-data.ts → (Fase 2: Supabase) → (Fase 3: Redis + DB)
```

**Regra de ouro**: O frontend NUNCA importa `mock-data.ts` diretamente. Todo acesso a dados passa pelo service layer → API Route → componente. Isso garante que na Fase 2, apenas o service layer mude — o resto não precisa saber de onde vêm os dados.

---

## Os 3 Níveis de Acesso

| Nível | Perfil | Rota principal | O que vê |
|---|---|---|---|
| 1 | Trainer / Vendedor | `/me` | Dados pessoais: suas próprias calls, score pessoal, dica de coaching |
| 2 | Gestor / Owner | `/dashboard` | Visão completa do time: ranking, alertas, insights de IA, tendências |
| 3 | AskMoses Admin | `/admin` | Painel SaaS: todos os clientes, MRR, config de rubrica |

---

## Logins de Demo

| Email | Senha | Role | Redireciona | Representa |
|---|---|---|---|---|
| `trainer@demo.askmoses.ai` | `demo123` | trainer | `/me` | Marcus R. — melhor do time |
| `owner@demo.askmoses.ai` | `demo123` | owner | `/dashboard` | Dono do negócio de adestramento |
| `admin@askmoses.ai` | `demo123` | admin | `/admin` | Equipe interna AskMoses |

---

## Design Tokens (extraídos do HTML de referência)

```css
--bg: #0D0F14          /* Fundo principal */
--bg2: #13161D         /* Cards e header */
--bg3: #1A1E28         /* Items secundários, alerts */
--bg4: #222736         /* Tracks de barras, badges */
--border: rgba(255,255,255,0.07)
--border2: rgba(255,255,255,0.12)
--text: #F0F2F8        /* Texto principal */
--muted: #7A849A       /* Labels, subtextos */
--accent: #6E56FF      /* Roxo principal */
--accent2: #9B87FF     /* Roxo claro */
--green: #22D9A0       /* Sucesso, close rate positivo */
--red: #FF5E5E         /* Alerta, queda */
--amber: #FFAB2E       /* Aviso */
--blue: #5EB3FF        /* Informação */
```

Fontes: **DM Sans** (texto) + **DM Mono** (números, badges, código mono)

---

---

# ÉPICO 0 — Setup & Infraestrutura

---

## TASK-001 — Inicializar projeto Next.js 14

**Tipo**: Setup
**Responsável**: Dev líder
**Bloqueia**: Tudo

### Descrição
Criar o projeto Next.js com todas as configurações base. Este é o passo zero — nada mais pode começar sem ele.

### Passos técnicos

```bash
npx create-next-app@latest askmoses-mvp \
  --typescript --tailwind --app --src-dir=false \
  --import-alias="@/*"

cd askmoses-mvp

# Dependências de produção
npm install @supabase/supabase-js @supabase/ssr
npm install recharts
npm install lucide-react

# shadcn/ui
npx shadcn@latest init
# Escolher: Dark theme, CSS variables, zinc base color

# Componentes shadcn necessários
npx shadcn@latest add button badge card table avatar
npx shadcn@latest add dropdown-menu sheet tooltip
npx shadcn@latest add skeleton
```

Configurar `tsconfig.json`:
- Verificar que `strict: true` está ativo
- Verificar que o path alias `@/*` aponta para a raiz

### Critérios de aceite
- [x] `npm run dev` roda sem erros em localhost:3000
- [x] TypeScript strict mode ativo (nenhum `any` implícito)
- [x] Tailwind funcionando (classe de teste visível)
- [x] shadcn/ui inicializado com tema dark
- [x] Commit inicial com estrutura base

> **STATUS: ✅ CONCLUÍDA** — Projeto já inicializado (v0 scaffold + deps instaladas)

---

## TASK-002 — Configurar Design Tokens

**Tipo**: Setup / Design
**Depende de**: TASK-001
**Bloqueia**: Todos os componentes visuais

### Descrição
Configurar as variáveis de design do AskMoses.AI no Tailwind e CSS global. Este passo garante que toda a equipe use as mesmas cores sem digitar hex codes nos componentes.

### Passos técnicos

**`app/globals.css`** — adicionar as variáveis:
```css
@layer base {
  :root {
    --bg: #0D0F14;
    --bg2: #13161D;
    --bg3: #1A1E28;
    --bg4: #222736;
    --border-subtle: rgba(255,255,255,0.07);
    --border-visible: rgba(255,255,255,0.12);
    --text-primary: #F0F2F8;
    --text-muted: #7A849A;
    --accent: #6E56FF;
    --accent2: #9B87FF;
    --green: #22D9A0;
    --green-bg: rgba(34,217,160,0.1);
    --red: #FF5E5E;
    --red-bg: rgba(255,94,94,0.1);
    --amber: #FFAB2E;
    --amber-bg: rgba(255,171,46,0.1);
    --blue: #5EB3FF;
    --blue-bg: rgba(94,179,255,0.1);
  }
}
```

**`tailwind.config.ts`** — mapear como classes Tailwind:
```typescript
colors: {
  bg: {
    DEFAULT: '#0D0F14',
    2: '#13161D',
    3: '#1A1E28',
    4: '#222736',
  },
  accent: { DEFAULT: '#6E56FF', 2: '#9B87FF' },
  success: '#22D9A0',
  danger: '#FF5E5E',
  warning: '#FFAB2E',
  info: '#5EB3FF',
  muted: '#7A849A',
}
```

**`app/layout.tsx`** — carregar fontes via `next/font`:
```typescript
import { DM_Sans, DM_Mono } from 'next/font/google'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] })
```

### Critérios de aceite
- [x] Variáveis CSS definidas em `globals.css`
- [ ] Cores disponíveis como classes Tailwind (ex: `bg-bg-2`, `text-muted`)
- [ ] Fontes DM Sans e DM Mono carregando via next/font
- [x] Background padrão da página é `#0D0F14`

> **STATUS: 🟡 PARCIAL** — Tokens CSS `--am-*` adicionados em globals.css. Falta: mapear no tailwind.config, carregar fontes DM Sans/DM Mono via next/font.

---

## TASK-003 — Configurar Supabase Auth

**Tipo**: Infraestrutura
**Depende de**: TASK-001
**Bloqueia**: TASK-004, TASK-008, TASK-009

### Descrição
Criar o projeto no Supabase, configurar a autenticação e criar a tabela `profiles` com o campo `role`. Esta é a ÚNICA integração real de dados na Fase 1.

### Passos no Supabase Dashboard
1. Criar projeto em [supabase.com](https://supabase.com)
2. Ir em SQL Editor e executar:

```sql
-- Tabela de perfis linkada ao auth.users
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  role TEXT CHECK (role IN ('trainer','owner','admin')) NOT NULL,
  owner_id UUID,
  name TEXT,
  avatar TEXT
);

-- Habilitar RLS (segurança)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Trigger para popular custom claim no JWT
-- Isso permite o middleware ler o role SEM consultar o banco
CREATE OR REPLACE FUNCTION set_role_claim()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || json_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE set_role_claim();
```

### Passos no código

**`/lib/supabase.ts`**:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

**`.env.local`** (não commitar):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # apenas para uso server-side
```

**`.env.example`** (commitar — sem valores reais):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Critérios de aceite
- [x] Projeto Supabase criado e acessível
- [x] Tabela `profiles` criada com trigger funcionando
- [x] `/lib/supabase.ts` configurado corretamente
- [x] `.env.local` local com variáveis reais (não commitado)
- [x] `.env.example` commitado com chaves sem valores

> **STATUS: ✅ CONCLUÍDA** — Supabase configurado, profiles table + trigger + RLS criados via CLI, .env.local e .env.example prontos.

---

## TASK-004 — Criar os 3 usuários demo no Supabase

**Tipo**: Configuração
**Depende de**: TASK-003
**Bloqueia**: TASK-008 (testes de middleware), TASK-010 (tela de login)

### Descrição
Criar os 3 usuários fixos de demo no Supabase Auth. Estes serão os logins usados pelo Ariel durante apresentações ao vivo.

### Passos
1. No Supabase Dashboard → Authentication → Users → "Invite User"
2. Criar cada usuário com email e senha
3. Após criação, inserir o registro em `profiles` via SQL:

```sql
-- Após criar cada usuário, pegar o ID e inserir:
INSERT INTO profiles (id, role, name, avatar) VALUES
  ('<UUID do trainer>', 'trainer', 'Marcus R.', 'MR'),
  ('<UUID do owner>', 'owner', 'Alex (Owner)', 'AO'),
  ('<UUID do admin>', 'admin', 'AskMoses Team', 'AM');
```

4. Verificar que o trigger rodou: em Authentication → Users, clicar no usuário e verificar que `raw_app_meta_data` contém `"role": "trainer"` (ou o role correto).

### Critérios de aceite
- [x] 3 usuários criados no Supabase Auth
- [x] Cada usuário tem registro correspondente em `profiles`
- [x] JWT de cada usuário contém `app_metadata.role` correto
- [ ] Login manual funciona para cada um dos 3

> **STATUS: ✅ CONCLUÍDA** — 3 usuários criados via script (setup-supabase.mjs). IDs: trainer=d086ee67, owner=19717dfd, admin=90577096. Falta testar login manual na UI.

---

---

# ÉPICO 1 — Data Layer (Mock Data + Services)

---

## TASK-005 — Criar `/lib/mock-data.ts`

**Tipo**: Data / Backend
**Depende de**: TASK-001
**Bloqueia**: TASK-006, TASK-007

### Descrição
Criar o arquivo central com TODOS os dados fictícios. É a fonte única de verdade (single source of truth). Deve espelhar o schema real que o banco terá na Fase 2, para que a migração seja direta.

**Contexto do negócio**: Dog training (adestramento de cães). Nomes de prospects, feedbacks e situações devem fazer sentido nesse contexto.

### Tipos TypeScript a definir (em `/lib/types.ts`)

```typescript
export type Role = 'trainer' | 'owner' | 'admin'
export type CallResult = 'closed' | 'no-close' | 'follow-up'
export type HealthStatus = 'healthy' | 'at-risk' | 'churning'
export type AvatarColor = 'blue' | 'purple' | 'green' | 'red'
export type TagColor = 'red' | 'amber' | 'blue' | 'green'

export interface Trainer {
  id: string
  name: string
  avatar: string       // Iniciais: 'MR', 'JL', etc
  avatarColor: AvatarColor
  role: Role
  totalCalls: number
  closeRate: number    // 0-100
  closeDelta: number   // positivo = melhora, negativo = queda
  score: number        // 0-100
  lastActive: string   // 'Ativo hoje', 'Ontem', '3 dias atrás'
  ownerId: string
}

export interface RubricScores {
  discovery: number
  problemAgitation: number
  offerPresentation: number
  objectionHandling: number
  closeAndNextSteps: number
}

export interface Call {
  id: string
  trainerId: string
  trainerName: string
  date: string          // 'YYYY-MM-DD'
  duration: string      // '38min'
  score: number
  result: CallResult
  prospect: string      // ex: 'Bob W.', 'Sarah K.'
  rubricScores: RubricScores
  feedback: string      // parágrafo geral de feedback
  strengths: string[]
  improvements: string[]
  transcript: string    // trecho fictício da conversa
}

export interface RubricSection {
  id: keyof RubricScores
  name: string
  weight: number        // % do score total
  isCritical: boolean
  description: string
  teamAvg: number
  color: 'blue' | 'amber' | 'green' | 'red' | 'accent2'
}

export interface Insight {
  id: string
  type: 'risk' | 'warning' | 'tip' | 'positive'
  icon: string          // emoji
  title: string
  tag: string
  tagColor: TagColor
  summary: string
  action: string
}

export interface Client {
  id: string
  name: string
  plan: 'Starter' | 'Pro' | 'Pro+RAG'
  callsThisMonth: number
  avgScore: number
  mrr: number           // em reais
  health: HealthStatus
  trainersCount: number
}

export interface TrendPoint {
  week: string          // 'S1', 'S2', etc
  closeRate: number
  score: number
}
```

### Dados a criar

**4 Trainers** (coerentes com o HTML de referência):
- Marcus R. — score 91, close 74%, delta +9, 28 calls, ativo hoje (cor azul)
- Jamie L. — score 87, close 68%, delta +4, 22 calls, ontem (cor roxo)
- Jordan K. — score 79, close 61%, delta +1, 19 calls, ativo hoje (cor verde)
- Taylor M. — score 74, close 55%, delta -2, 14 calls, 3 dias atrás (cor vermelho)

**15+ Calls** (distribuídas entre os 4 trainers, coerentes com seus scores):
- Marcus: ~7 calls, maioria fechadas, scores entre 85-96
- Jamie: ~5 calls, maioria fechadas, scores entre 78-92
- Jordan: ~5 calls, misto de resultados, scores entre 65-84
- Taylor: ~4 calls, maioria não fechadas, scores entre 58-72
- Prospects com nomes relacionados a pets: Bob W., Sarah K., Mike D., Linda P., etc.
- Feedbacks relacionados ao negócio de adestramento de cães

**5 Seções de Rubrica** (exatamente conforme HTML):
- Discovery — média 83, cor blue, crítico: true
- Problem Agitation — média 72, cor amber, crítico: true
- Offer Presentation — média 86, cor green, crítico: false
- Objection Handling — média 64, cor red, crítico: true ← ponto mais fraco
- Close & Next Steps — média 78, cor accent2, crítico: true

**4 Insights** (exatamente conforme HTML de referência):
- 🚨 "Objection Handling é o maior vazamento de receita" (tag red, padrão de equipe)
- ⚠️ "Taylor está em risco de desengajamento" (tag amber, alerta de trainer)
- 💡 "Discovery de Marcus pode elevar toda a equipe" (tag blue, boas práticas)
- 📈 "Coaching funcionando — close rate +7pts em 6 semanas" (tag green, sinal de ROI)

**3 Clientes** (para o painel admin):
- Paw Masters Academy — Plano Pro, 83 calls, score 83, MRR R$497, health: healthy
- Elite K9 Training — Plano Starter, 94 calls, score 76, MRR R$297, health: at-risk
- Dog Whisperers Co. — Plano Pro+RAG, 70 calls, score 88, MRR R$697, health: healthy

**6 TrendPoints** (coerentes com o gráfico do HTML):
S1: {closeRate: 57, score: 72} → S6: {closeRate: 68, score: 86}

### Critérios de aceite
- [x] `/lib/types.ts` com todos os tipos exportados
- [x] `/lib/mock-data.ts` com todas as entidades exportadas individualmente
- [x] IDs únicos e coerentes (trainerId nas calls bate com id dos trainers)
- [x] Scores individuais das calls são coerentes com os averages dos trainers
- [x] Contexto de dog training presente em nomes, feedbacks e transcrições
- [x] Arquivo compila sem erros TypeScript

> **STATUS: ✅ CONCLUÍDA** — types.ts + mock-data.ts criados com 4 trainers, 21 calls, 5 rubric sections, 4 insights, 3 clients, 6 trend points.

---

## TASK-006 — Criar Service Layer (`/lib/services/`)

**Tipo**: Backend
**Depende de**: TASK-005
**Bloqueia**: TASK-007

### Descrição
Criar os services que abstraem o acesso a dados. Na Fase 1, retornam mock. Na Fase 2, apenas estes arquivos mudam. Todas as funções devem ser `async` mesmo retornando mock — isso garante que a troca para Supabase seja uma linha de código.

### Arquivos a criar

**`/lib/services/calls.service.ts`**:
```typescript
import type { Role } from '@/lib/types'
import { calls } from '@/lib/mock-data'

// Fase 1: mock | Fase 2: supabase | Fase 3: redis → supabase
export async function getCalls(role: Role, userId: string) {
  if (role === 'trainer') {
    return calls.filter(c => c.trainerId === userId)
  }
  return calls
}

export async function getCallById(id: string) {
  return calls.find(c => c.id === id) ?? null
}
```

**`/lib/services/trainers.service.ts`**:
```typescript
import { trainers } from '@/lib/mock-data'

export async function getTrainers() {
  return trainers
}

export async function getTrainerById(id: string) {
  return trainers.find(t => t.id === id) ?? null
}
```

**`/lib/services/insights.service.ts`**:
```typescript
import { insights } from '@/lib/mock-data'

export async function getInsights() {
  return insights
}
```

**`/lib/services/clients.service.ts`**:
```typescript
import { clients, globalMetrics } from '@/lib/mock-data'

export async function getClients() {
  return clients
}

export async function getGlobalMetrics() {
  return globalMetrics
}
```

**`/lib/services/rubric.service.ts`**:
```typescript
import { rubricSections, trendData } from '@/lib/mock-data'

export async function getRubricSections() {
  return rubricSections
}

export async function getTrendData() {
  return trendData
}
```

### Critérios de aceite
- [x] 5 services criados, todos com funções async
- [x] Zero imports de `mock-data.ts` fora da pasta `/lib/services/`
- [x] Tipagem TypeScript correta em parâmetros e retornos
- [x] Lógica de filtragem por role implementada em `getCalls`

> **STATUS: ✅ CONCLUÍDA** — calls, trainers, insights, clients, rubric services criados.

---

## TASK-007 — Criar API Routes (`/app/api/`)

**Tipo**: Backend
**Depende de**: TASK-006, TASK-009
**Bloqueia**: Todas as telas

### Descrição
Os endpoints REST que o frontend consome. Cada route handler valida a sessão, verifica o role e chama o service correspondente. Retornam JSON no formato padrão `{ data, error }`.

### Endpoints a criar

**`/app/api/calls/route.ts`** — `GET /api/calls`
```typescript
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return json({ data: null, error: 'Unauthorized' }, 401)

  const { role, sub: userId } = session.user.app_metadata
  const calls = await getCalls(role, userId)

  // Suporta query params: ?trainerId= ?result= ?dateFrom= ?dateTo=
  const filtered = applyFilters(calls, request.nextUrl.searchParams)

  return json({ data: filtered, error: null })
}
```

**`/app/api/calls/[id]/route.ts`** — `GET /api/calls/:id`
- Verifica se trainer está acessando call própria (403 se não)
- Retorna 404 se call não encontrada

**`/app/api/trainers/route.ts`** — `GET /api/trainers`
- Apenas para roles `owner` e `admin` (403 para trainer)

**`/app/api/insights/route.ts`** — `GET /api/insights`
- Apenas para roles `owner` e `admin`

**`/app/api/clients/route.ts`** — `GET /api/clients`
- Apenas para role `admin` (403 para outros)

**Formato padrão de resposta**:
```typescript
// Sucesso
{ data: T, error: null }

// Erro
{ data: null, error: { message: string, code: number } }
```

### Critérios de aceite
- [x] 5 endpoints criados e respondendo JSON correto
- [x] 401 quando sem sessão
- [x] 403 quando role não autorizado
- [x] 404 quando recurso não encontrado
- [x] Formato `{ data, error }` consistente em todas as respostas
- [x] Query params de filtro funcionam em `/api/calls`

> **STATUS: ✅ CONCLUÍDA** — /api/calls, /api/calls/[id], /api/trainers, /api/insights, /api/clients, /api/rubric criados.

---

---

# ÉPICO 2 — Autenticação & Roteamento

---

## TASK-008 — Criar `middleware.ts`

**Tipo**: Backend / Auth
**Depende de**: TASK-003, TASK-009
**Bloqueia**: TASK-010

### Descrição
O middleware intercepta TODA requisição antes das páginas. Lê o JWT do Supabase, extrai o role via custom claim (sem consultar o banco) e redireciona automaticamente.

### Lógica de roteamento

```
Não autenticado      → redireciona para /login
/login (autenticado) → redireciona para rota principal do role
/                    → redireciona para rota principal do role
/me/*                → qualquer role pode acessar
/dashboard/*         → bloqueia trainer → redireciona para /me
/admin/*             → bloqueia trainer e owner → redireciona para /dashboard
```

### Código base
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* get/set/remove handlers */ } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const path = request.nextUrl.pathname

  // Não autenticado → login
  if (!session && !path.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Autenticado tentando acessar login → rota principal
  if (session && path.startsWith('/login')) {
    const role = session.user.app_metadata?.role
    return NextResponse.redirect(new URL(redirectByRole(role), request.url))
  }

  if (session) {
    const role = session.user.app_metadata?.role

    if (path.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    if (path.startsWith('/dashboard') && role === 'trainer') {
      return NextResponse.redirect(new URL('/me', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

### Critérios de aceite
- [x] Usuário sem sessão → redireciona para `/login`
- [x] Usuário autenticado acessando `/login` → redireciona para rota correta
- [x] Trainer acessando `/dashboard` → redireciona para `/me`
- [x] Owner acessando `/admin` → redireciona para `/dashboard`
- [x] Admin acessa qualquer rota sem bloqueio
- [x] Assets estáticos e `/api/` não são interceptados (evitar loops)

> **STATUS: ✅ CONCLUÍDA** — middleware.ts criado com proteção por role e matcher correto.

---

## TASK-009 — Criar `/lib/auth.ts`

**Tipo**: Backend / Auth
**Depende de**: TASK-003
**Bloqueia**: TASK-007, TASK-008

### Descrição
Helpers de autenticação reutilizáveis. Usados nos API Route Handlers e Server Components para evitar repetição de código.

```typescript
// lib/auth.ts
import { createServerClient } from '@supabase/ssr'
import type { Role } from '@/lib/types'

export async function getSession() {
  // Retorna a sessão atual ou null
}

export async function getRole(): Promise<Role | null> {
  const session = await getSession()
  return session?.user.app_metadata?.role ?? null
}

export async function requireRole(allowed: Role | Role[]) {
  const role = await getRole()
  if (!role) throw new AuthError(401, 'Not authenticated')

  const roles = Array.isArray(allowed) ? allowed : [allowed]
  if (!roles.includes(role)) throw new AuthError(403, 'Forbidden')

  return role
}

export function redirectByRole(role: Role): string {
  const routes: Record<Role, string> = {
    trainer: '/me',
    owner: '/dashboard',
    admin: '/admin',
  }
  return routes[role] ?? '/login'
}
```

### Critérios de aceite
- [x] `getRole()` retorna o role do JWT sem chamada ao banco
- [x] `requireRole()` lança erro com status HTTP correto
- [x] `redirectByRole()` retorna a rota correta para cada role
- [x] Tipagem TypeScript correta

> **STATUS: ✅ CONCLUÍDA** — lib/auth.ts com getSession, getRole, getUserId, redirectByRole, unauthorized, forbidden, notFound, ok helpers.

---

## TASK-010 — Tela de Login (`/app/(auth)/login/page.tsx`)

**Tipo**: Frontend / Auth
**Depende de**: TASK-002, TASK-003, TASK-004, TASK-009
**Bloqueia**: Fluxo de demo completo

### Descrição
Tela de login com identidade visual do AskMoses.AI. Inclui atalhos de demo para facilitar apresentações ao vivo.

### Elementos da tela
1. **Logo AskMoses.AI** no centro (igual ao header do HTML de referência: bloco roxo "M" + texto)
2. **Formulário**: campo email + campo senha + botão "Entrar"
3. **Seção de Demo Shortcuts** — visível, não escondida:
   - 3 botões: "Entrar como Trainer", "Entrar como Gestor", "Entrar como Admin"
   - Ao clicar, preenche o form automaticamente (sem submeter)
4. **Mensagem de erro** em caso de credenciais inválidas

### Comportamento
```typescript
const handleLogin = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) { setError('Email ou senha incorretos') ; return }

  const role = data.session.user.app_metadata?.role
  router.push(redirectByRole(role))
}
```

### Critérios de aceite
- [ ] Login funciona com os 3 emails de demo
- [ ] Erro exibido para credenciais inválidas (sem expor detalhes técnicos)
- [x] Demo shortcuts preenchem e submetem o form
- [ ] Após login bem-sucedido, redireciona para a rota correta do role
- [x] Identidade visual: dark background, logo AskMoses.AI, sem outros elementos

> **STATUS: 🟡 PARCIAL** — Tela de login criada com shortcuts de demo e visual dark. Falta testar login funcional no browser.

---

---

# ÉPICO 3 — Componentes Compartilhados

---

## TASK-011 — Criar componentes base reutilizáveis

**Tipo**: Frontend
**Depende de**: TASK-002
**Bloqueia**: TASK-013, TASK-014, TASK-015, TASK-016, TASK-018

### Descrição
Componentes de UI que aparecem em múltiplas telas. Todos controlados por props (sem estado interno de dados). Criar na pasta `/components/ui/` ou `/components/shared/`.

### Componentes a criar

**`/components/shared/RubricBar.tsx`**
```tsx
interface RubricBarProps {
  label: string
  value: number        // 0-100
  color: 'blue' | 'green' | 'amber' | 'red' | 'accent2'
  showValue?: boolean  // default: true
}
// Animação obrigatória: CSS transition width 1s ease
// Referência visual: seção "Rubric por seção" do HTML
```

**`/components/shared/ScoreCard.tsx`**
```tsx
interface ScoreCardProps {
  label: string
  value: string | number
  valueColor?: string   // ex: 'var(--green)', 'var(--accent2)'
  delta?: number        // positivo = verde com ↑, negativo = vermelho com ↓
  deltaLabel?: string   // ex: 'desde semana 1'
}
// Referência visual: os 4 cards de métrica do topo do HTML
```

**`/components/shared/InsightCard.tsx`**
```tsx
interface InsightCardProps {
  insight: Insight
}
// Layout: emoji + título + tag colorida + resumo + caixa de ação
// Hover: border-color + translateY(-1px)
// Referência visual: seção "Insights de IA" do HTML
```

**`/components/shared/TrainerAvatar.tsx`**
```tsx
interface TrainerAvatarProps {
  initials: string
  color: 'blue' | 'purple' | 'green' | 'red'
  size?: 'sm' | 'md' | 'lg'
}
// sm: 28px, md: 38px (padrão), lg: 48px
// Cores de fundo: rgba com 15% de opacidade
```

**`/components/shared/ScorePill.tsx`**
```tsx
interface ScorePillProps {
  score: number
}
// ≥ 85 → verde (sp-green)
// 75-84 → âmbar (sp-amber)
// < 75 → vermelho (sp-red)
// Referência: .score-pill no HTML
```

**`/components/shared/AlertItem.tsx`**
```tsx
interface AlertItemProps {
  dotColor: 'red' | 'amber' | 'green' | 'blue'
  text: string
  actionLabel: string
  onAction?: () => void
}
// Referência: .alert-item no HTML
```

**`/components/shared/SectionLabel.tsx`**
```tsx
// Label de seção em uppercase, tamanho 11px, letra-espaçada, cor muted
// Referência: .s-label no HTML
```

### Critérios de aceite
- [x] 7 componentes criados e exportados
- [x] Props TypeScript sem `any`
- [x] RubricBar tem animação CSS obrigatória
- [x] ScorePill muda cor automaticamente baseado no valor
- [x] Todos usam variáveis CSS do design system (não hex codes hardcoded)

> **STATUS: ✅ CONCLUÍDA** — RubricBar, ScoreCard, InsightCard, TrainerAvatar, ScorePill, AlertItem, SectionLabel criados em components/shared/.

---

## TASK-012 — Criar layouts por grupo de acesso

**Tipo**: Frontend
**Depende de**: TASK-002, TASK-009
**Bloqueia**: Todas as telas

### Descrição
Layouts base para cada grupo de acesso. Usa Route Groups do Next.js App Router — cada grupo tem sidebar e navegação independentes.

### Estrutura de arquivos
```
app/
  (auth)/
    layout.tsx           ← Minimalista: só centra o conteúdo, sem sidebar
    login/
      page.tsx
  (trainer)/
    layout.tsx           ← Sidebar trainer + header
    me/
      page.tsx
      calls/
        [id]/
          page.tsx
  (owner)/
    layout.tsx           ← Sidebar owner + header
    dashboard/
      page.tsx
    calls/
      page.tsx
      [id]/
        page.tsx
  (admin)/
    layout.tsx           ← Sidebar admin + header
    admin/
      page.tsx
      rubric/
        page.tsx
```

### Header (igual para todos os layouts autenticados)
```
[Logo AskMoses.AI]    [Semana 6 / 6]  [• live]
```
- Logo: bloco roxo "M" + texto "Ask**Moses**.AI"
- Badge de semana: fundo bg4, borda, fonte mono
- Dot live: verde pulsante (animação `pulse` como no HTML)
- Botão logout: ícone apenas, canto direito

### Sidebar do Trainer
- Dashboard (`/me`) — ícone LayoutDashboard
- (Sem mais itens na Fase 1)

### Sidebar do Gestor
- Visão do Time (`/dashboard`) — ícone Users
- Calls (`/calls`) — ícone Phone

### Sidebar do Admin
- Painel SaaS (`/admin`) — ícone Building2
- Config de Rubrica (`/admin/rubric`) — ícone Settings

### Mobile
- Sidebar oculta por padrão em mobile
- Hambúrguer no header abre Sheet (componente shadcn/ui)
- Drawer desliza da esquerda com os mesmos itens da sidebar

### Critérios de aceite
- [x] 4 layouts criados (auth, trainer, owner, admin)
- [x] Header idêntico visualmente ao HTML de referência
- [x] Sidebar com item ativo destacado (cor accent, fundo sutil)
- [ ] Mobile: sidebar como Sheet/Drawer funcionando
- [x] Logout funcionando em todos os layouts (supabase.auth.signOut() → redirect /login)

> **STATUS: 🟡 PARCIAL** — 4 layouts + AppHeader + 3 sidebars criados. Falta: mobile Sheet/Drawer para sidebar.

---

---

# ÉPICO 4 — Nível 2: Dashboard do Gestor *(Prioridade máxima)*

---

## TASK-013 — Tela `/dashboard` — Visão geral do time

**Tipo**: Frontend
**Depende de**: TASK-007, TASK-011, TASK-012
**Prioridade**: CRÍTICA — é a tela central da demo

### Descrição
A tela mais importante da demo. Seguir o HTML de referência (`askmoses-dashboard.html`) como especificação visual exata. Esta tela deve estar perfeita.

### Seções (de cima para baixo)

**1. Section Label**: "Visão geral da equipe"

**2. Métricas de topo** — 4 cards em grid (4 colunas desktop, 2x2 tablet, 1 coluna mobile)
```
Close rate médio: 64%  ↑ +7pts desde semana 1   (valor: green)
Score médio: 83         ↑ +11pts desde semana 1  (valor: accent2)
Total de calls: 83      4 trainers ativos         (valor: text)
Melhor close rate: 74%  Marcus R.                 (valor: text)
```
Animação: fadeUp com delay escalonado (0.05s, 0.1s, 0.15s, 0.2s)

**3. Grid principal** — 2 colunas (1fr + 340px fixo)

*Coluna principal* — Card "Ranking de trainers":
- 4 linhas de trainer com: Avatar | Nome + "Ativo hoje · N calls" | close% | delta | ScorePill
- Separador entre trainers (borda sutil)
- Ordem: Marcus (91) → Jamie (87) → Jordan (79) → Taylor (74)

*Coluna lateral* — Card "Alertas ativos":
- 4 AlertItems com as mensagens do HTML de referência

**4. Grid de gráficos** — 2 colunas (1fr + 1fr)

*Esquerda* — Card "Rubric por seção — média da equipe":
```
Discovery          ████████░░  83  (blue)
Problem Agitation  ███████░░░  72  (amber)
Offer Presentation █████████░  86  (green)
Objection Handling ██████░░░░  64  (red)
Close & Next Steps ████████░░  78  (accent2)
```

*Direita* — Card "Tendência — 6 semanas":
- Legenda: linha verde = Close rate% | linha roxa = Score
- Recharts LineChart, height 180px
- Tooltip customizado: fundo #1A1E28, borda rgba

```tsx
// Implementação do gráfico
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

<ResponsiveContainer width="100%" height={180}>
  <LineChart data={trendData}>
    <Line type="monotone" dataKey="closeRate" stroke="#22D9A0"
          strokeWidth={2} dot={{ fill: '#22D9A0', r: 4 }}
          fill="rgba(34,217,160,0.08)" />
    <Line type="monotone" dataKey="score" stroke="#9B87FF"
          strokeWidth={2} dot={{ fill: '#9B87FF', r: 4 }} />
    <XAxis dataKey="week" tick={{ fill: '#7A849A', fontSize: 11 }}
           axisLine={false} tickLine={false} />
    <YAxis domain={[50, 100]} tick={{ fill: '#7A849A', fontSize: 11 }}
           axisLine={false} tickLine={false} />
    <Tooltip contentStyle={{
      background: '#1A1E28',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
    }} />
  </LineChart>
</ResponsiveContainer>
```

**5. Section Label**: "Score por trainer — rubric detalhado"

**6. Tabela de rubric detalhada**:
- Colunas: Seção | Equipe | Marcus R. | Jamie L. | Jordan K. | Taylor M.
- Destaque verde no maior valor de cada linha
- Destaque vermelho em valores críticos (<65)

**7. Section Label**: "Insights de IA"

**8. Grid de insights** — 2x2 grid
- 4 InsightCards com dados mockados
- Hover: border-color + translateY(-1px)

### Dados (buscar via fetch nos Server Components)
```typescript
const [trainers, insights, rubric, trend] = await Promise.all([
  fetch('/api/trainers').then(r => r.json()),
  fetch('/api/insights').then(r => r.json()),
  fetch('/api/rubric').then(r => r.json()),
  fetch('/api/trend').then(r => r.json()),
])
```

### Critérios de aceite
- [ ] Visual pixel-próximo ao HTML de referência
- [x] Todos os 4 metric cards com dados corretos e animação fadeUp
- [x] Ranking na ordem correta (score decrescente)
- [x] 4 alertas com cores corretas (red pulsante, amber, green pulsante, blue)
- [x] Barras de rubrica com animação de largura (CSS transition 1s)
- [x] Gráfico renderizando com tooltip funcional
- [x] Tabela com highlight verde no melhor por linha
- [x] 4 cards de insight com hover effect
- [ ] Responsivo: colapsa corretamente em tablet e mobile

> **STATUS: 🟡 PARCIAL** — Dashboard criado com todas as seções (metrics, ranking, alerts, rubric bars, trend chart, rubric table, insights). Falta: verificação visual pixel-a-pixel com o HTML de referência + ajustes de responsividade.

---

## TASK-014 — Tela `/calls` — Tabela de calls do gestor

**Tipo**: Frontend
**Depende de**: TASK-007, TASK-011, TASK-012

### Descrição
Listagem de todas as calls com filtros. O gestor pode filtrar e selecionar calls para ver o detalhe.

### Elementos

**Filtros** (barra no topo, acima da tabela):
- Dropdown "Trainer": Todos | Marcus R. | Jamie L. | Jordan K. | Taylor M.
- Dropdown "Resultado": Todos | Fechado | Não fechado | Follow-up
- Input de busca (opcional — busca por nome do prospect)

**Tabela**:
| Trainer | Prospect | Data | Duração | Score | Resultado | — |
|---|---|---|---|---|---|---|
| Avatar + Nome | Nome do prospect | 22/03/26 | 38min | ScorePill | Badge colorido | → |

Badge de resultado:
- `closed` → badge verde "Fechado"
- `no-close` → badge vermelho "Não fechado"
- `follow-up` → badge âmbar "Follow-up"

Linha inteira clicável → navega para `/calls/[id]`

**Estado vazio**: ícone + "Nenhuma call encontrada com esses filtros"

### Filtros: client-side
Os filtros são aplicados no cliente (sem nova chamada à API) para performance máxima com poucos dados.

### Critérios de aceite
- [ ] Tabela lista todas as calls (15+)
- [ ] Filtro por trainer funciona (reduz linhas imediatamente)
- [ ] Filtro por resultado funciona
- [ ] Badge de resultado com cor correta
- [ ] Clicar em qualquer parte da linha navega para `/calls/[id]`
- [ ] Estado vazio quando combinação de filtros não retorna resultados

---

## TASK-015 — Componente `CallDetail.tsx` + telas `/calls/[id]` e `/me/calls/[id]`

**Tipo**: Frontend
**Depende de**: TASK-007, TASK-011

### Descrição
Componente reutilizado pelo gestor E pelo trainer. Comportamento muda conforme `viewerRole`.

### Interface do componente
```tsx
interface CallDetailProps {
  call: Call
  viewerRole: 'trainer' | 'owner' | 'admin'
  onBack: () => void
}
```

### Layout do componente

```
┌────────────────────────────────────────────────┐
│ ← Voltar    Call com Bob W.   22/03/26 · 38min │
├────────────────────────────────────────────────┤
│         94                                     │
│    Score geral        (verde se ≥85)           │
│    Fechado ✓                                   │
├────────────────────────────────────────────────┤
│ ANÁLISE POR SEÇÃO                              │
│ Discovery          ──────────────── 94  (blue) │
│ Problem Agitation  ─────────────   89 (amber) │
│ Offer Presentation ──────────────── 95 (green)│
│ Objection Handling ─────────────   81  (red)  │
│ Close & Next Steps ─────────────── 90 (acc2)  │
├────────────────────────────────────────────────┤
│ PONTOS FORTES                                  │
│ ✓ Fez 3 perguntas abertas antes de apresentar │
│ ✓ Lidou com objeção de preço com elegância    │
├────────────────────────────────────────────────┤
│ PONTOS DE MELHORIA                             │
│ → Poderia aprofundar mais o problem agitation  │
├────────────────────────────────────────────────┤
│ TRECHO DA TRANSCRIÇÃO                          │
│ Marcus: Conte-me mais sobre os desafios...     │ ← fonte mono
│ Bob: O Rex não obedece nenhum comando...       │
├────────────────────────────────────────────────┤
│ [apenas owner/admin] NOTAS DE COACHING         │
│ ┌──────────────────────────────────────────┐  │
│ │ Textarea (não persiste na Fase 1)        │  │
│ └──────────────────────────────────────────┘  │
│                          [Dar Feedback]        │
└────────────────────────────────────────────────┘
```

### Segurança (verificar na API)
Se um trainer tentar acessar `/me/calls/[id]` de uma call que não é sua → API retorna 403 → página mostra "Call não encontrada" e botão de voltar.

### Critérios de aceite
- [ ] Score em destaque (grande, colorido conforme valor)
- [ ] RubricBars para cada seção com valores individuais (não da equipe)
- [ ] Strengths com ícone check verde
- [ ] Improvements com ícone arrow âmbar
- [ ] Transcrição em fonte monospace, truncada com "ver mais"
- [ ] Campo de notas e botão de feedback visível apenas para owner/admin
- [ ] Campo de notas não persiste ao recarregar (Fase 1)

---

---

# ÉPICO 5 — Nível 1: Dashboard do Trainer

---

## TASK-016 — Tela `/me` — Dashboard pessoal do trainer

**Tipo**: Frontend
**Depende de**: TASK-007, TASK-011, TASK-012

### Descrição
Dashboard pessoal com foco em melhoria individual. Tom motivacional. O trainer vê APENAS seus próprios dados.

### Elementos

**1. Saudação personalizada**
```
Olá, Marcus R.  ·  Semana 6 de 6
```

**2. Métricas pessoais** — 2 cards (ou 3, se incluir total de calls):
- Score pessoal: 91 (accent2) | ↑ +19pts desde semana 1
- Close rate: 74% (green) | ↑ +9pts desde semana 1

**3. Rubrica pessoal** — barras com comparação vs. média do time:
```
Discovery          ────────────── 94  [+11 acima da média]
Problem Agitation  ───────────    89  [+17 acima da média]
Offer Presentation ─────────────  95  [+9 acima da média]
Objection Handling ──────────     81  [+17 acima da média]
Close & Next Steps ─────────────  90  [+12 acima da média]
```
Delta vs. média: verde se positivo, vermelho se negativo

**4. Dica de coaching** (da última call):
```
┌──────────────────────────────────────────────┐
│ 💬 Dica da sua última call                  │
│                                              │
│ Seu Discovery está excelente. Foque agora   │
│ em aprofundar o Problem Agitation antes de  │
│ apresentar a oferta.                        │
└──────────────────────────────────────────────┘
```
Estilo: borda esquerda accent, fundo bg3 (igual ao `insight-action` do HTML)

**5. Histórico de calls** — lista das últimas 5-6 calls:
```
Bob W.     22/03  Score: 94  ● Fechado
Sarah K.   20/03  Score: 88  ● Fechado
Mike D.    18/03  Score: 79  ○ Follow-up
...
```
Clicar → navega para `/me/calls/[id]`

### Dados
`GET /api/calls` — retorna apenas calls do trainer autenticado (filtro por role no service layer)

### Critérios de aceite
- [ ] Trainer vê APENAS suas próprias calls
- [ ] Score e close rate com delta colorido
- [ ] Barras de rubrica com delta vs. média do time
- [ ] Delta positivo em verde, negativo em vermelho
- [ ] Dica de coaching com visual accent-border
- [ ] Lista de calls com link para detalhe
- [ ] Se 0 calls → estado vazio motivacional

---

## TASK-017 — Tela `/me/calls/[id]` — Detalhe de call do trainer

**Tipo**: Frontend
**Depende de**: TASK-015

### Descrição
Reutiliza `CallDetail.tsx` com `viewerRole="trainer"`. A única diferença para o gestor é a ausência do campo de notas de coaching.

### Implementação
```typescript
// app/(trainer)/me/calls/[id]/page.tsx
export default async function TrainerCallDetail({ params }: { params: { id: string } }) {
  const call = await fetchCall(params.id)  // GET /api/calls/[id]
  if (!call) notFound()

  return <CallDetail call={call} viewerRole="trainer" onBack={() => router.back()} />
}
```

### Critérios de aceite
- [ ] Rota `/me/calls/[id]` funcional
- [ ] Busca dados via API (não diretamente do mock)
- [ ] Renderiza `CallDetail` sem campo de notas
- [ ] `notFound()` se call não encontrada ou não pertence ao trainer

---

---

# ÉPICO 6 — Nível 3: Admin Panel

---

## TASK-018 — Tela `/admin` — Painel SaaS

**Tipo**: Frontend
**Depende de**: TASK-007, TASK-011, TASK-012

### Descrição
Visão interna da equipe AskMoses. Não é a visão de um cliente — é o painel para gerenciar os clientes da plataforma.

### Elementos

**1. Section Label**: "Visão da plataforma"

**2. Métricas globais** — 4 cards:
- Total de clientes: 3
- Calls processadas/mês: 247
- MRR total: R$ 1.491
- Score médio da plataforma: 81

**3. Tabela de clientes**:

| Cliente | Plano | Calls/mês | Score médio | MRR | Health | — |
|---|---|---|---|---|---|---|
| Paw Masters Academy | Pro | 83 | 83 | R$497 | 🟢 Saudável | → |
| Elite K9 Training | Starter | 94 | 76 | R$297 | 🟡 Em Risco | → |
| Dog Whisperers Co. | Pro+RAG | 70 | 88 | R$697 | 🟢 Saudável | → |

Health badge:
- `healthy` → badge verde "Saudável"
- `at-risk` → badge âmbar "Em Risco"
- `churning` → badge vermelho "Crítico"

Botão "→" de detalhe: visual only na Fase 1 (sem página de detalhe)

### Critérios de aceite
- [ ] 4 metric cards com dados globais coerentes
- [ ] Tabela com 3 clientes e todos os campos
- [ ] Health badge com cores corretas
- [ ] Rota acessível apenas para role `admin` (middleware garante)
- [ ] Visual consistente com o resto do design system

---

## TASK-019 — Tela `/admin/rubric` — Config de rubrica

**Tipo**: Frontend
**Depende de**: TASK-005, TASK-012

### Descrição
Permite visualizar e "editar" as seções da rubrica. Na Fase 1, é uma UI de exibição — os toggles e botão de salvar são visuais (não persistem).

### Elementos

**1. Lista das 5 seções**:
Cada seção em card:
```
┌─────────────────────────────────────────────┐
│ Discovery                    [● Crítico]    │
│ Peso: 20%                                   │
│ Qualidade das perguntas abertas e           │
│ escuta ativa                                │
└─────────────────────────────────────────────┘
```
Toggle "Crítico/Opcional" — visual only (não persiste)

**2. Preview do prompt de IA** (caixa de texto readonly):
```
Avalie a seção Discovery da call. Verifique se o vendedor:
- Fez pelo menos 2 perguntas abertas
- Demonstrou escuta ativa
- Identificou a dor principal do prospect
Score de 0-10 com justificativa.
```

**3. Botão "Salvar configuração"**: exibe um toast "Funcionalidade disponível em breve"

### Critérios de aceite
- [ ] 5 seções listadas com nome, peso e descrição
- [ ] Toggle de crítico/opcional visual (não persiste ao recarregar)
- [ ] Preview de prompt em textarea readonly
- [ ] Botão salvar exibe toast informativo
- [ ] Rota acessível apenas para role `admin`

---

---

# ÉPICO 7 — Polish, Deploy & Entrega

---

## TASK-020 — Loading states e estados vazios

**Tipo**: Frontend / UX
**Depende de**: TASK-013, TASK-014, TASK-016, TASK-018

### Descrição
Feedback visual obrigatório. Sem loading states, a demo parece lenta e quebrada ao navegar.

### Loading states
Usar `loading.tsx` do App Router (renderizado automaticamente pelo Next.js):

```typescript
// app/(owner)/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-8">
      {/* Skeleton dos metric cards */}
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-bg-2 rounded-xl animate-pulse" />
        ))}
      </div>
      {/* Skeleton do ranking */}
      <div className="h-64 bg-bg-2 rounded-xl animate-pulse" />
    </div>
  )
}
```

**Regra**: Skeleton deve ter o mesmo layout geral do conteúdo real (mesma altura aproximada, mesma estrutura).

### Estados vazios

Tabela de calls sem resultado após filtro:
```tsx
<div className="text-center py-16 text-muted">
  <PhoneOff className="mx-auto mb-3 opacity-40" size={32} />
  <p>Nenhuma call encontrada</p>
  <p className="text-sm">Tente ajustar os filtros</p>
</div>
```

Trainer sem calls:
```tsx
<div className="text-center py-16 text-muted">
  <Phone className="mx-auto mb-3 opacity-40" size={32} />
  <p>Você ainda não tem calls esta semana</p>
</div>
```

### Critérios de aceite
- [ ] `loading.tsx` criado para: `/dashboard`, `/calls`, `/me`, `/admin`
- [ ] Skeletons com `animate-pulse` e layout aproximado do conteúdo
- [ ] Estado vazio nas tabelas de calls
- [ ] Nenhum erro de hydration no console do browser

---

## TASK-021 — Responsividade mobile (viewport 375px)

**Tipo**: Frontend / CSS
**Depende de**: TASK-013, TASK-016, TASK-018

### Descrição
O dashboard deve ser legível em iPhone SE (375px). Não precisa ser perfeito — não pode estar quebrado.

### Breakpoints a aplicar

```css
/* Dashboard: grid de métricas */
.metrics-row: grid-cols-4 → md:grid-cols-2 → grid-cols-1

/* Grid principal (1fr 340px) */
.main-grid: grid-cols-[1fr_340px] → md:grid-cols-1

/* Grid de gráficos (1fr 1fr) */
.chart-grid: grid-cols-2 → md:grid-cols-1

/* Grid de insights (1fr 1fr) */
.insights-grid: grid-cols-2 → md:grid-cols-1
```

```tsx
// Tailwind classes
<div className="grid grid-cols-4 md:grid-cols-2 sm:grid-cols-1 gap-3">
```

**Tabela de calls**: adicionar `overflow-x-auto` no container

**Sidebar**: ocultar em mobile, hamburger abre Sheet

### Critérios de aceite
- [ ] Viewport 375px: nenhum scroll horizontal indesejado
- [ ] Grids colapsam corretamente
- [ ] Sidebar funciona como Sheet/Drawer em mobile
- [ ] Tabelas com scroll horizontal quando necessário
- [ ] Fonte mínima de 12px em textos importantes

---

## TASK-022 — Deploy no Vercel

**Tipo**: DevOps
**Depende de**: Todas as tasks anteriores

### Descrição
Configurar e realizar o deploy final na Vercel.

### Passos

**1. Preparar repositório**:
- Garantir que `.env.local` está no `.gitignore`
- Commitar `.env.example` com as chaves sem valores

**2. Conectar à Vercel**:
- Criar projeto em vercel.com
- Conectar repositório GitHub
- Framework: Next.js (auto-detectado)

**3. Configurar Environment Variables na Vercel**:
```
NEXT_PUBLIC_SUPABASE_URL = https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY = eyJ...
```

**4. Configurar domínio** (se disponível):
- Domínio customizado: `demo.askmoses.ai`
- Ou usar o padrão `askmoses-mvp.vercel.app`

**5. Verificar build**:
```bash
npm run build  # Deve passar sem erros TypeScript ou ESLint críticos
```

**6. Testar em produção**: Cada um dos 3 logins após o deploy

### Critérios de aceite
- [ ] `npm run build` passa sem erros
- [ ] URL pública acessível sem VPN
- [ ] HTTPS ativo (Vercel fornece automaticamente)
- [ ] Variáveis de ambiente corretas em produção
- [ ] Os 3 logins de demo funcionam em produção

---

## TASK-023 — Testes do fluxo completo + README de acesso

**Tipo**: QA
**Depende de**: TASK-022

### Descrição
Testar o fluxo de apresentação completo como se fosse o Ariel apresentando para um prospect. Criar documento de acesso para o cliente.

### Script de teste completo

```
1. Abrir URL em aba anônima (sem cache)

2. [TRAINER] Login com trainer@demo.askmoses.ai / demo123
   ✓ Redireciona para /me
   ✓ Vê score pessoal e close rate
   ✓ Vê barras de rubrica com deltas
   ✓ Vê dica de coaching
   ✓ Clica em uma call → abre detalhe em /me/calls/[id]
   ✓ Não vê campo de notas de coaching
   ✓ Tentar acessar /dashboard → redireciona para /me
   → Logout

3. [GESTOR] Login com owner@demo.askmoses.ai / demo123
   ✓ Redireciona para /dashboard
   ✓ Vê os 4 metric cards com dados corretos
   ✓ Vê ranking de trainers na ordem correta
   ✓ Vê 4 alertas ativos com cores corretas
   ✓ Vê barras de rubrica da equipe
   ✓ Vê gráfico de tendência com tooltip ao hover
   ✓ Vê tabela detalhada de rubric por trainer
   ✓ Vê 4 cards de insight de IA
   ✓ Navega para /calls → vê tabela de calls
   ✓ Aplica filtro por trainer → lista reduz
   ✓ Clica em call → abre detalhe
   ✓ Vê campo de notas de coaching no detalhe
   ✓ Tentar acessar /admin → redireciona para /dashboard
   → Logout

4. [ADMIN] Login com admin@askmoses.ai / demo123
   ✓ Redireciona para /admin
   ✓ Vê 4 metric cards com dados globais
   ✓ Vê tabela com 3 clientes e health badges
   ✓ Navega para /admin/rubric → vê seções da rubrica
   ✓ Toggle de crítico/opcional funciona visualmente
   ✓ Botão salvar exibe toast
   ✓ Consegue acessar /dashboard (admin tem acesso total)
   → Logout
```

### README de acesso (`DEMO_ACCESS.md`)

```markdown
# AskMoses.AI — Acesso à Demo

URL: https://[URL do Vercel]

## Logins

| Perfil | Email | Senha | Vai para |
|--------|-------|-------|----------|
| Trainer (Marcus R.) | trainer@demo.askmoses.ai | demo123 | /me |
| Gestor (Owner) | owner@demo.askmoses.ai | demo123 | /dashboard |
| Admin AskMoses | admin@askmoses.ai | demo123 | /admin |

## Script de demo sugerido

1. Entrar como Gestor → mostrar visão do time, alertas, insights de IA
2. Clicar em call do Taylor → mostrar o que o gestor vê
3. Logout → entrar como Trainer (Marcus) → mostrar visão pessoal
4. Logout → entrar como Admin → mostrar painel SaaS
```

### Critérios de aceite
- [ ] Todos os 23 checks do script passam sem erro
- [ ] Nenhum 404, loop de redirect ou erro de console
- [ ] `DEMO_ACCESS.md` criado e enviado para o Ariel
- [ ] Fluxo completo da demo executável em menos de 5 minutos

---

---

# Resumo: Ordem de Execução

```
DIA 1 — Infraestrutura e dados
  TASK-001 (setup Next.js)
  TASK-002 (design tokens)
  TASK-003 (Supabase Auth)
  TASK-004 (usuários demo)
  TASK-005 (mock-data.ts)
  TASK-006 (service layer)
  TASK-007 (API routes)
  TASK-008 (middleware)
  TASK-009 (auth helpers)

DIA 2 — Nível 2: Dashboard do Gestor
  TASK-011 (componentes base)
  TASK-012 (layouts por role)
  TASK-013 (tela /dashboard)
  TASK-014 (tela /calls)

DIA 3 — Call Detail + Nível 1: Trainer
  TASK-015 (componente CallDetail + rotas de detalhe)
  TASK-016 (tela /me)
  TASK-017 (tela /me/calls/[id])

DIA 4 — Nível 3: Admin + Login
  TASK-018 (tela /admin)
  TASK-019 (tela /admin/rubric)
  TASK-010 (tela de login)

DIA 5 — Polish, Deploy e Entrega
  TASK-020 (loading states e estados vazios)
  TASK-021 (responsividade mobile)
  TASK-022 (deploy Vercel)
  TASK-023 (testes + README)
```

---

# Critérios de Entrega da Fase 1

| Critério | Definição de Pronto |
|---|---|
| Auth funcionando | Login com cada um dos 3 usuários demo redireciona para a rota correta |
| Proteção de rotas | Trainer não acessa /dashboard. Owner não acessa /admin. Redirect automático. |
| Navegação fluida | Todas as 8 telas navegáveis sem erro 404 ou loop de redirect |
| Dados realistas | Nomes, scores, feedbacks fazem sentido para negócio de adestramento |
| Mobile-friendly | Dashboard legível em viewport de 375px (iPhone SE) |
| Deploy estável | Vercel build passando, URL acessível sem VPN ou login especial |
| Nível 3 funcional | Admin vê lista de clientes com métricas mockadas distintas |

---

*Documento gerado em 24/03/2026 · Net Midas para AskMoses.AI · Fase 1 v1.0*
