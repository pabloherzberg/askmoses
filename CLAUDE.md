# AskMoses — Contexto para devs

Plataforma de sales coaching para negócios de adestramento de cães. **Está em produção com
clientes reais**: toda mudança pode afetar dados, notas e cobrança de gente pagando.

- A call de venda chega pelo **GoHighLevel** (webhook `app/api/webhooks/ghl`), passa por
  Whisper (em pedaços, `lib/services/chunk-pipeline.ts`), diarização e scoring por LLM.
  Depois vêm o email de coaching e os alertas de pipeline no Slack (`lib/services/pipeline-alerts.ts`).
- A call **agenda a visita**. Quem fecha a venda é o treinador, presencialmente. "Close rate"
  mede agendamento, não receita.
- Cobrança por minuto de call (`lib/billing.ts`, `/dashboard/billing`).
- Crons na Vercel (`vercel.json`): recuperação de análises travadas, sync de oportunidades e
  agendamentos do GHL, snapshot semanal e sugestão semanal de script.

## Ambientes e deploy

| Ambiente | Branch | Supabase |
|---|---|---|
| Production | `main` | `askmoses-prd` (`efrqmmgwpwkhgvyithuw`) |
| Preview | `dev` e PRs | `supabase-askmoses-dev` (`azphsweveznidfttykbq`) |

- Fluxo: branch de feature → PR para `dev` (deploy Preview) → PR "Release: …" `dev → main`.
  O merge em `main` publica em produção automaticamente. **Nunca fazer merge em `main` sem pedido explícito.**
- O banco de dev costuma estar atrás de prod. Antes de testar no Preview, confira se as
  colunas que o código usa existem lá.
- Supabase é banco **e** auth. RLS por org ativa; scripts e crons usam `service_role`.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind 4 + shadcn/ui · Recharts ·
Supabase (Postgres + Auth) · next-intl (`en`, `pt`, `es`, `fr`) · Vitest · Vercel.

## Estrutura do repo

```
app/[locale]/            páginas (todas localizadas)
  (auth)/                login, signup, forgot-password
  (trainer)/me/          painel do trainer
  (admin)/admin/         painel do admin (orgs, rubricas, LLM, impersonação)
  dashboard/             home do owner + upload, history, analytics, insights,
                         billing, settings, script-builder
  calls/, calls/[id]     calls do time
  team-command-center/, marketing-intelligence/, intent-analysis/, onboarding/
app/api/                 rotas da API (webhooks/ghl, cron/*, calls/*, admin/*, …)
lib/db/                  acesso ao banco (um arquivo por entidade)
lib/services/            regras de negócio (pipeline, scoring, GHL, billing, alertas)
lib/auth.ts              sessão, papel, redirectByRole(), helpers de resposta
lib/score-display.ts     única fonte de escala e limiares de score
components/layout|shared|ui   layout, componentes do produto, shadcn
middleware.ts            locale, sessão e bloqueio por papel
scripts/NNN_*.sql        migrations numeradas; scripts/*.mts são correções e reprocessos
tests/                   Vitest (inclui testes de contrato que leem o fonte)
docs/                    specs e guias (GHL, checklist de correções, insights engine)
SCHEMA.md, BACKEND.md    referência de schema e backend
```

`lib/mock-data.ts`, `lib/mocks/` e o `MSWProvider` são resto da demo da Fase 1 (MSW só roda
em `development`). O produto usa a API e o banco reais.

## Papéis e acesso

A home de cada papel vem de `redirectByRole()` (`lib/auth.ts`, espelhado no `middleware.ts`):
trainer → `/me`, owner → `/dashboard`, admin → `/admin`.

| Área | Trainer | Owner | Admin |
|---|---|---|---|
| `/me` (suas calls e score) | ✅ | ✅ | ✅ |
| `/dashboard/upload` | ✅ | ✅ | ✅ |
| Resto de `/dashboard/*`, `/calls` | ❌ → `/me` | ✅ | ✅ |
| `/team-command-center`, `/marketing-intelligence`, `/intent-analysis` | ❌ → `/me` | ✅ | ✅ |
| `/dashboard/script-builder` | ❌ | ❌ | ✅ |
| `/admin/*` | ❌ | ❌ | ✅ |

- Admin pode impersonar uma org e operá-la como owner.
- Owner/trainer com `password_set: false` são levados a definir a senha.
- Rotas legadas: `/overview` → `/dashboard`, `/coaching` → `/team-command-center`.

## Formato de resposta da API

```ts
{ data: T, error: null }                                  // sucesso: ok(data)
{ data: null, error: { message: string, code: number } }  // erro
```

Use os helpers de `lib/auth.ts`: `ok()`, `unauthorized()` (401), `forbidden()` (403) e `notFound()` (404).

## Migrations (`scripts/NNN_*.sql`)

- **Numeração:** antes de escolher o número, rode `git fetch` e confira
  `git ls-tree --name-only origin/dev scripts/`. Branches paralelas já colidiram, e houve
  renumeração (ex.: a 112 nasceu 110).
- **Idempotente** (`IF NOT EXISTS`, `DO $$ … $$`), com bloco de rollback comentado no fim.
- **Aplicar primeiro no dev**, depois em prod, e antes do merge na `dev` se o código depender dela.
  Use `execute_sql` (MCP) ou o SQL Editor; `apply_migration` criaria `supabase_migrations` em prod.
- **Nunca copie o corpo de uma função de uma migration antiga** (regra do `SCHEMA.md`).
  `CREATE OR REPLACE` substitui a função inteira e desfaz correções feitas depois. Parta de
  `SELECT pg_get_functiondef('public.nome'::regproc);` no banco vivo.
- Nada de migration aplicada em prod sem arquivo no repo.

## Correção de dados em prod

- Toda alteração manual em `calls` grava a trilha em `public.calls_data_corrections` **antes**
  do UPDATE: `call_id`, `column_name`, `old_value`, `new_value`, `applied_by` (quem executou:
  script/identificador da correção) e `reason`.
- **Se a gravação na trilha falhar, aborte.** Não siga com o UPDATE e não trate como aviso.
  Em SQL, faça numa transação com `RAISE EXCEPTION` (modelo: `118_stage2_won_backfill.sql`,
  que também confere a contagem esperada antes de gravar).
- Rode primeiro em modo prévia (`--dry-run` / SELECT), depois aplique.

## Bases das métricas (`lib/sales-calls.ts`)

- **Contagem de calls, score e billing:** `applySalesCallOnly` (`is_sales_call IS DISTINCT FROM false`).
- **Close rate:** `applySalesCallWithOutcome` / `hasOutcome` / `closeRateOf`, só calls de venda
  **com resultado** (`call_outcome IS NOT NULL`). Call sem resultado (falha de pipeline, em
  processamento) não é "não fechou". `toCall` põe `result: 'not_closed'` nela só para exibição e
  marca `hasOutcome: false`. Não calcule close rate com `result === 'closed' / length`.
- **`call_stats_weekly` (função `stamp_call_stats_weekly`, 107):** `total_calls` conta **todas** as
  calls de venda da semana, **inclusive as sem resultado**. `closed_calls / total_calls` **não** é o
  close rate do produto. Nenhuma tela lê a tabela hoje; quem for consumir precisa de uma coluna com
  as calls com resultado (migration nova + recarimbar).

## Design tokens

Use `var(--am-*)` (`styles/globals.css`), nunca hex direto. Tema escuro no `:root`, claro em `.light`.

| Token | Escuro | Uso |
|---|---|---|
| `--am-bg` / `bg2` / `bg3` / `bg4` | `#0D0F14` / `#13161D` / `#1A1E28` / `#222736` | fundo, cards, itens, tracks |
| `--am-text` / `--am-muted` | `#F0F2F8` / `#7A849A` | texto, labels |
| `--am-accent` / `--am-accent2` | `#6E56FF` / `#9B87FF` | roxo principal / claro |
| `--am-green` / `--am-red` | `#22D9A0` / `#FF5E5E` | positivo / negativo |
| `--am-amber` / `--am-blue` | `#C97A00` / `#5EB3FF` | aviso / informação |
| `--am-border` / `--am-border2` | brancos a 7% / 12% | bordas |

- Fontes: DM Sans (`--am-font`) e DM Mono (`--am-mono`, para números e badges).
- Score: interno 0–100, exibido 0–5. Limiares e cores **só** via `lib/score-display.ts`
  (`scoreLevel`: ≥ 85 alto, ≥ 70 médio).

## Antes de abrir PR

1. `npx tsc --noEmit` e `npx vitest run`.
2. A `dev` tem falhas pré-existentes. Compare com um baseline (`git stash push -u` → rodar →
   `git stash pop` → rodar → `diff`) e diga no PR o que é novo e o que já existia.
3. PR para `dev`, nunca direto para `main`.
4. Convenção do time em `.githooks/` (ative com `git config core.hooksPath .githooks`):
   branch `feature/`, `fix/` ou `bug/`, e mensagem de commit `origem: <branch> - <descrição>`.

## Segurança

Nunca commitar credenciais, tokens, service keys ou senhas, nem logins de demo, neste
arquivo ou em qualquer outro. Variáveis ficam na Vercel e no `.env.local` (fora do git).
