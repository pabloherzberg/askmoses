# Backend — Guia de desenvolvimento

Documento para a equipe sobre a arquitetura de backend implementada e como continuar o desenvolvimento dos endpoints.

---

## Visão geral

O backend do AskMoses roda **dentro do próprio Next.js**, usando API Routes (`app/api/`). Não há servidor separado.

O fluxo completo de uma requisição é:

```
Browser
  → fetch('/api/calls')
  → app/api/calls/route.ts       (1. valida auth + parse params)
  → lib/services/calls.ts        (2. decide: mock ou banco)
  → lib/db/calls.ts              (3. executa query no Supabase)
  → Response { data, error }     (4. retorna JSON padronizado)
```

Cada camada tem uma responsabilidade única. **Nunca pule camadas** — a route não chama `lib/db/` diretamente, e o `lib/db/` não conhece nada sobre HTTP.

---

## Estrutura de arquivos

```
lib/
  supabase/
    client.ts       → client browser (Supabase Auth, componentes)
    server.ts       → client server com cookies (middleware, Server Components)
    admin.ts        → client com service role key (lib/db/ apenas) ← NOVO
  db/
    calls.ts        → queries da tabela calls           ← NOVO
    trainers.ts     → queries da tabela trainers        ← NOVO
    clients.ts      → queries da tabela clients         ← NOVO
    rubric.ts       → queries das tabelas rubric/trend  ← NOVO
    insights.ts     → queries da tabela insights        ← NOVO
    scripts.ts      → queries da tabela scripts         ← NOVO
    index.ts        → barrel export de tudo             ← NOVO
  services/
    calls.ts        → orquestra: dev=mock | prod=db     ← ATUALIZADO
    trainers.ts     → orquestra: dev=mock | prod=db     ← ATUALIZADO
    clients.ts      → orquestra: dev=mock | prod=db     ← ATUALIZADO
    rubric.ts       → orquestra: dev=mock | prod=db     ← ATUALIZADO
    insights.ts     → orquestra: dev=mock | prod=db     ← ATUALIZADO
    scripts.ts      → orquestra: dev=mock | prod=db     ← ATUALIZADO
  auth.ts           → getSession(), getRole(), ok(), unauthorized()...
  types.ts          → interfaces TypeScript
  mock-data.ts      → dados fictícios (apenas dev)

app/
  api/
    auth/login/route.ts
    auth/logout/route.ts
    calls/route.ts
    calls/[id]/route.ts
    trainers/route.ts
    clients/route.ts
    rubric/route.ts
    rubric-config/route.ts
    insights/route.ts
    scripts/route.ts
    scripts/[id]/route.ts
    analyze/route.ts
    transcribe/route.ts
    generate-script/route.ts
    generate-criteria/route.ts
    send-coaching/route.ts
    send-insights/route.ts
    blob-token/route.ts
```

---

## As 3 camadas em detalhe

### Camada 1 — API Route (`app/api/`)

Responsável por:
- Validar se o usuário está autenticado
- Validar se o role tem permissão para o endpoint
- Fazer parse e validação dos parâmetros (query string ou body)
- Chamar o service
- Retornar a resposta HTTP padronizada

```typescript
// app/api/calls/route.ts
import { type NextRequest } from 'next/server'
import { getSession, getRole, ok, unauthorized, forbidden } from '@/lib/auth'
import { getCalls } from '@/lib/services/calls'
import type { CallResult } from '@/lib/types'

export async function GET(request: NextRequest) {
  // 1. Autenticação
  const session = await getSession()
  if (!session) return unauthorized()

  // 2. Autorização por role (exemplo)
  const role = await getRole()
  if (role === 'trainer') return forbidden()

  // 3. Parse de params
  const { searchParams } = request.nextUrl
  const trainerId = searchParams.get('trainerId') ?? undefined
  const result = (searchParams.get('result') as CallResult) ?? undefined

  // 4. Chama o service
  const data = await getCalls({ trainerId, result })

  // 5. Retorna resposta padronizada
  return ok(data)
}
```

**Helpers disponíveis em `lib/auth.ts`:**

| Função | Retorno | Uso |
|---|---|---|
| `getSession()` | session ou null | Verificar se está logado |
| `getRole()` | `'trainer' \| 'owner' \| 'admin' \| null` | Verificar permissão |
| `getUserId()` | string ou null | ID do usuário logado |
| `ok(data)` | `Response 200` | Retorno de sucesso |
| `unauthorized()` | `Response 401` | Sem sessão |
| `forbidden()` | `Response 403` | Role sem permissão |
| `notFound(entity?)` | `Response 404` | Recurso não encontrado |

---

### Camada 2 — Service (`lib/services/`)

Responsável por:
- Abstrair a origem dos dados (mock em dev, banco em prod)
- Conter lógica de negócio simples (cálculos, agregações, filtros)
- Ser chamada pela API Route

```typescript
// lib/services/calls.ts
const IS_DEV = process.env.NODE_ENV === 'development'

export async function getCalls(filters?: GetCallsFilters): Promise<Call[]> {
  if (IS_DEV) {
    // Usa mock-data diretamente no server-side
    const { calls } = await import('@/lib/mock-data')
    // ... aplica filtros e retorna
  }

  // Produção: delega para lib/db/
  const { dbGetCalls } = await import('@/lib/db/calls')
  return dbGetCalls(filters)
}
```

> Em desenvolvimento, o MSW intercepta chamadas `fetch()` no browser.
> Nas API routes (server-side), o mock-data é importado diretamente.
> **Nenhuma das API routes precisa mudar** quando o banco real estiver pronto.

---

### Camada 3 — DB (`lib/db/`)

Responsável por:
- Executar as queries no Supabase usando o **admin client** (service role)
- Mapear os dados do banco (snake_case) para as interfaces TypeScript (camelCase)
- Tratar erros do Supabase e relançar como `Error` com contexto

```typescript
// lib/db/calls.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { Call } from '@/lib/types'

export async function dbGetCalls(filters?: GetCallsFilters): Promise<Call[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .order('date', { ascending: false })

  if (error) throw new Error(`dbGetCalls: ${error.message}`)

  return data as unknown as Call[]
}
```

**Convenções:**
- Toda função começa com `db` (ex: `dbGetCalls`, `dbCreateScript`)
- Erros do Supabase viram `throw new Error(...)` — a route captura via try/catch
- `PGRST116` = not found → retornar `null` (não lançar erro)
- Sempre usar `createAdminClient()` — nunca o client browser ou server com cookies

---

## Como implementar um endpoint (passo a passo)

### Exemplo: implementar `GET /api/trainers/:id`

**Passo 1 — Criar a tabela no Supabase**

Defina o schema da tabela `trainers` no dashboard do Supabase ou via migration SQL.

**Passo 2 — Implementar a query em `lib/db/trainers.ts`**

Abra [lib/db/trainers.ts](lib/db/trainers.ts) e preencha o `TODO`:

```typescript
export async function dbGetTrainerById(id: string): Promise<Trainer | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('trainers')
    .select('*, calls(count)')   // join com contagem de calls
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null   // not found
    throw new Error(`dbGetTrainerById: ${error.message}`)
  }

  // Mapear snake_case → camelCase
  return {
    id: data.id,
    name: data.name,
    totalCalls: data.calls[0].count,
    // ...
  } as Trainer
}
```

**Passo 3 — O service já está pronto**

`lib/services/trainers.ts` já chama `dbGetTrainerById` em produção. Nada a fazer.

**Passo 4 — Criar a API Route**

```typescript
// app/api/trainers/[id]/route.ts
import { getSession, ok, unauthorized, notFound } from '@/lib/auth'
import { getTrainerById } from '@/lib/services/trainers'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const trainer = await getTrainerById(params.id)
  if (!trainer) return notFound('Trainer')

  return ok(trainer)
}
```

**Passo 5 — Testar**

Em dev, o mock responde automaticamente (dados de `lib/mock-data.ts`).
Em prod, a query real no Supabase é executada.

---

## Formato de resposta — padrão obrigatório

Todas as respostas da API seguem este formato:

```typescript
// Sucesso
{ data: T, error: null }

// Erro
{ data: null, error: { message: string, code: number } }
```

**Use sempre os helpers de `lib/auth.ts`** — eles já aplicam esse formato:

```typescript
return ok(data)           // { data: ..., error: null }
return unauthorized()     // { data: null, error: { message: 'Não autenticado', code: 401 } }
return forbidden()        // { data: null, error: { message: 'Acesso não autorizado', code: 403 } }
return notFound('Call')   // { data: null, error: { message: 'Call não encontrado', code: 404 } }
```

Para erros inesperados (catch), use:
```typescript
try {
  const data = await getCalls()
  return ok(data)
} catch (err) {
  console.error(err)
  return Response.json(
    { data: null, error: { message: 'Erro interno', code: 500 } },
    { status: 500 }
  )
}
```

---

## Matriz de permissões por endpoint

Ao implementar cada route, aplique a autorização por role:

| Endpoint | trainer | owner | admin |
|---|---|---|---|
| `GET /api/calls` | ❌ | ✅ | ✅ |
| `GET /api/calls/[id]` | próprias | ✅ | ✅ |
| `GET /api/trainers` | ❌ | ✅ | ✅ |
| `GET /api/clients` | ❌ | ❌ | ✅ |
| `GET /api/rubric` | ✅ | ✅ | ✅ |
| `GET /api/insights` | ❌ | ✅ | ✅ |
| `GET /api/scripts` | ✅ | ✅ | ✅ |
| `POST /api/scripts` | ❌ | ✅ | ✅ |
| `POST /api/analyze` | ❌ | ✅ | ✅ |

---

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
# Obrigatórias (já configuradas)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Nunca expor no browser

# Necessárias ao implementar os endpoints de IA
OPENAI_API_KEY=

# Necessárias ao implementar upload
BLOB_READ_WRITE_TOKEN=

# Necessárias ao implementar e-mail
RESEND_API_KEY=
```

> `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente em `lib/supabase/admin.ts`.
> Qualquer variável sem o prefixo `NEXT_PUBLIC_` é automaticamente server-only no Next.js.

---

## O que ainda precisa ser feito (TODOs)

Cada arquivo em `lib/db/` tem comentários `// TODO:` indicando:

1. **Implementar a query real** após criar a tabela no Supabase
2. **Mapear snake_case → camelCase** (banco usa `trainer_id`, interface usa `trainerId`)
3. **Adicionar autorização por role** nas API routes que ainda não têm

Busque no projeto por `// TODO:` para ver todos os pontos pendentes.

---

## Regras que não devem ser quebradas

1. `lib/db/` nunca é importado por Client Components (`"use client"`)
2. `createAdminClient()` nunca é chamado fora de `lib/db/`
3. API Routes nunca importam `lib/mock-data.ts` diretamente
4. Toda resposta HTTP usa os helpers `ok()`, `unauthorized()`, `forbidden()`, `notFound()`
5. Toda função em `lib/db/` começa com `db` (convenção de nomenclatura)
