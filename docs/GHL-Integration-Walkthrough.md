# GHL Webhook Integration — Walkthrough Completo

> **Quem deve ler isto:** Victor (e/ou um assistente de IA atuando como copiloto dele) que precisa entender como a integração GHL → AskMoses funciona, configurar o Pepper corretamente, e validar end-to-end. Doc é auto-contido — não exige conhecimento prévio do código.
>
> **Última atualização:** 2026-05-22
> **Branch:** `feat/ghl-integration` (commits `cef2b42`, `3392566` aplicados hoje)

---

## 1. TL;DR

Quando uma call termina no GoHighLevel (Pepper), o workflow GHL dispara um webhook HTTP POST para o backend AskMoses (Next.js na Vercel). O backend identifica a org pelo header, valida o secret, normaliza o payload, persiste a call no Supabase, retorna 200 imediatamente, e dispara um pipeline async (Whisper transcription) via `after()` do Next 15. O pipeline termina em `transcribed` — scoring + coaching email são features futuras.

**O que está bloqueando o primeiro teste real:** o valor do campo `type` no Custom Data do Pepper foi salvo com aspas literais (`"callCompleted"` em vez de `callCompleted`). Precisa ser corrigido na UI do Pepper — ver seção 6 abaixo.

---

## 2. Arquitetura

### 2.1 Visão geral do fluxo

```
┌─────────────┐      POST /api/webhooks/ghl     ┌──────────────────────────┐
│   GHL /     │ ───────────────────────────────►│  Next.js Handler         │
│   Pepper    │  Headers: X-GHL-Location-Id,    │  app/api/webhooks/ghl    │
│  Workflow   │           X-AskMoses-Secret     │  /route.ts               │
└─────────────┘  Body:    { customData: {...}}  └──────────────────────────┘
                                                            │
                                                            │ 1. Resolve org
                                                            ▼
                                                ┌──────────────────────────┐
                                                │  Supabase                │
                                                │  organizations (lookup)  │
                                                │  calls (upsert)          │
                                                └──────────────────────────┘
                                                            │
                                                            │ 2. Returns 200
                                                            │    { callId, status: "received" }
                                                            ▼
                                                ┌──────────────────────────┐
                                                │  after() — async         │
                                                │  processGhlCall()        │
                                                └──────────────────────────┘
                                                            │
                                                            ▼
            ┌──────────────────────────────────────────────────────────────────────┐
            │ Pipeline Async:                                                       │
            │  1. fetchRecordingUrl(contactId) — GHL Conversations API             │
            │     ↓ se falhar / null → no_recording                                │
            │  2. downloadRecording(url) — bytes do MP3 (com S3 fallback)          │
            │     ↓ se falhar → transcription_failed                               │
            │  3. transcribeAudioBuffer(buffer) — Whisper, 3 retries               │
            │     ↓ se todas falharem → transcription_failed                       │
            │  4. UPDATE calls SET processing_status = 'transcribed'               │
            └──────────────────────────────────────────────────────────────────────┘
                                                            │
                                                            │ Em qualquer estado terminal de erro:
                                                            ▼
                                                ┌──────────────────────────┐
                                                │  notifyPipelineFailure() │
                                                │  POST opcional para      │
                                                │  PIPELINE_ALERT_WEBHOOK  │
                                                │  _URL (Slack-compatible) │
                                                └──────────────────────────┘
```

### 2.2 Mapa de arquivos (responsabilidades)

| Arquivo | Papel |
|---|---|
| [app/api/webhooks/ghl/route.ts](../app/api/webhooks/ghl/route.ts) | Handler HTTP POST. Auth via header, valida payload, upsert no DB com idempotência, dispara pipeline async. |
| [lib/services/ghl-helpers.ts](../lib/services/ghl-helpers.ts) | Types (`GhlWebhookPayload`, `GhlRawWebhookBody`) + helpers puros (`normalizeEmpty`, `normalizeSource`, `parseDuration`, `detectCallType`, `buildExternalCallId`). Sem side-effects. |
| [lib/services/ghl-call-pipeline.ts](../lib/services/ghl-call-pipeline.ts) | Pipeline async. Recebe `accessToken` per-org via options. Termina em estado terminal (`transcribed` ou um dos 3 estados de erro). |
| [lib/services/ghl-api.ts](../lib/services/ghl-api.ts) | Cliente HTTP da GHL Conversations API (`fetchRecordingUrl`, `downloadRecording`). Lida com Bearer auth + fallback S3 pré-assinado. |
| [lib/services/whisper.ts](../lib/services/whisper.ts) | Wrapper de `transcribeAudioBuffer` (Whisper API). |
| [lib/services/pipeline-alerts.ts](../lib/services/pipeline-alerts.ts) | Helper best-effort `notifyPipelineFailure` para alertar Slack. No-op se env não setada. |
| [lib/db/calls.ts](../lib/db/calls.ts) | DB operations: `dbUpsertGhlCall`, `dbUpdateGhlCallPipeline`. |
| [lib/db/organizations.ts](../lib/db/organizations.ts) | DB operations: `dbGetOrgGhlConfigByLocation` (lookup por location ID), `dbGetOrgGhlAdminView`, `dbUpdateOrgGhlConfig`. |
| [app/api/admin/organizations/[id]/ghl/route.ts](../app/api/admin/organizations/[id]/ghl/route.ts) | API admin pra configurar GHL por org (location ID, access token, secret, enabled). Gera webhook URL e secret. |

### 2.3 Schema relevante do Supabase

**`organizations` (campos GHL):**
- `id` (UUID, PK)
- `name` (text)
- `ghl_location_id` (text, unique quando setado) — chave de lookup do webhook
- `ghl_access_token` (text, encrypted) — token per-org para chamar GHL API
- `ghl_webhook_secret` (text, encrypted) — secret para validar requests
- `ghl_enabled` (boolean) — toggle de feature

**`calls` (campos GHL):**
- `id` (UUID, PK)
- `org_id` (UUID, FK → organizations)
- `external_call_id` (text, unique index) — hash determinístico (formato `ghl_<sha256>`); chave de idempotência
- `trainer_name`, `trainer_email`, `client_name`, `lead_name`, `lead_source`
- `duration_seconds` (int)
- `ghl_payload` (jsonb) — envelope cru completo (root + customData)
- `recording_url` (text)
- `transcript` (text)
- `transcript_source` (text, enum) — `whisper` para calls do GHL
- `processing_status` (text, enum) — `pending` | `processing` | `transcribed` | `no_recording` | `transcription_failed` | `webhook_failed`
- `created_at`, `updated_at`

---

## 3. Estrutura do Payload (o "gotcha" principal)

**Toda a confusão de ontem foi por causa disto:** quando você configura "Custom Data" em um workflow webhook no GHL, o GHL **NÃO** envia esses campos no nível raiz do JSON body. Ele aninha tudo sob a chave `customData`. Os campos nativos do GHL (contact, location, workflow, message) ficam no root.

### 3.1 O que GHL realmente envia

Capturado de um teste real do Pepper:

```jsonc
{
  // ────────── CAMPOS NATIVOS DO GHL (root) ──────────
  // Não controlamos esses; vêm automaticamente.
  "contact_id": "xSCSxSknhx4hQwUEb9GV",
  "first_name": "Laryn",
  "last_name": "Wasson",
  "email": "grant.laryn@gmail.com",
  "phone": "+13143232939",
  "tags": "facebook,evaluation",
  "address1": "...",
  "city": "...",
  "state": "PA",
  "country": "US",
  "date_created": "2026-03-29T02:48:51.451Z",
  "contact_source": "E1) Facebook LP Form",

  "location": {
    "name": "Centurion Canine LLC",
    "id": "tZd61H2adMPsphEwGyDt",           // ← mesmo valor do header X-GHL-Location-Id
    "address": "120 Artman Lane",
    "city": "Murrysville", "state": "PA"
  },

  "workflow": {
    "id": "304c91e6-250d-4f79-8bfc-156af0aaca05",
    "name": "New Workflow : 1779382682901"
  },

  "message": { "type": 1 },

  "contact": {
    "attributionSource": { /* ... */ },
    "lastAttributionSource": { /* ... */ }
  },

  // ────────── CUSTOM DATA (aninhado) ──────────
  // O que NÓS configuramos no Pepper. Esses são os campos que o
  // handler do AskMoses lê.
  "customData": {
    "type": "callCompleted",                  // ← OBRIGATÓRIO, valor literal
    "contactId": "xSCSxSknhx4hQwUEb9GV",      // ← OBRIGATÓRIO
    "userId": "tVptWlgCFneT1orswjlv",
    "callStatus": "completed",
    "callDirection": "outbound",
    "transcript": "",                          // ← Ignorado (usamos Whisper)
    "userName": "Sarah Schaefer",
    "userEmail": "...",
    "contactName": "Laryn Wasson",
    "duration": "34",
    "contactSource": "E1) Facebook LP Form",
    "contactEmail": "grant.laryn@gmail.com"
  }
}
```

### 3.2 O handler lê de `customData`, NÃO do root

Em [route.ts:49-59](../app/api/webhooks/ghl/route.ts#L49-L59):

```ts
let rawBody: GhlRawWebhookBody
try {
  rawBody = (await req.json()) as GhlRawWebhookBody
} catch {
  return jsonError("Invalid JSON", 400)
}

const payload = rawBody.customData
if (!payload) {
  return jsonError("Missing customData in webhook body", 400)
}
```

Daí em diante o código lê `payload.type`, `payload.contactId`, etc. — todos os campos vêm de `customData`. O `rawBody` inteiro é persistido em `calls.ghl_payload` pra debug (contém `location`, `workflow`, etc.).

### 3.3 A armadilha das aspas

No Custom Data UI do Pepper, ao digitar `callCompleted` no campo Value, **NÃO** colocar aspas. Quando você digita `"callCompleted"`, o GHL guarda as aspas como parte da string. Resultado:

```jsonc
"customData": {
  "type": "\"callCompleted\""    // ← VALOR REAL: a string `"callCompleted"` (8+2 chars)
}
```

Comparado contra `"callCompleted"` (sem aspas internas) na linha 66 do handler, **não bate**:

```ts
if (normalizedType !== "callCompleted") { ... }
```

**Defensiva no código** ([route.ts:62-65](../app/api/webhooks/ghl/route.ts#L62-L65)) — agora o handler faz `trim()` + remove aspas no início/fim:

```ts
const normalizedType =
  typeof payload.type === "string"
    ? payload.type.trim().replace(/^"+|"+$/g, "")
    : ""
```

Mesmo assim, **a melhor prática é digitar limpo no Pepper** — a defensiva é só rede de segurança contra esse erro específico ressurgir.

---

## 4. Identificação da Org (multi-tenant)

A integração suporta múltiplas orgs no mesmo backend. A org é identificada **pelo header `X-GHL-Location-Id`** — NÃO por path da URL, NÃO por algum field do payload.

### 4.1 Fluxo de resolução

1. Pepper envia o request com header `X-GHL-Location-Id: <orgLocationId>`.
2. Handler chama `dbGetOrgGhlConfigByLocation(locationId)` → retorna `{ orgId, webhookSecret, accessToken, enabled }` ou `null`.
3. Se `null` → 404 `"Unknown or disabled location"`.
4. Handler valida o `X-AskMoses-Secret` contra o `webhookSecret` da org (timing-safe compare).
5. Pipeline async usa o `accessToken` da própria org pra chamar a GHL API.

### 4.2 Como configurar uma nova org

Acesso de admin no AskMoses:

1. Logar como `admin@askmoses.ai` (ou qualquer admin).
2. Ir em `/admin/organizations/<orgId>/integrations/ghl`.
3. Preencher:
   - **Location ID**: o `locationId` do GHL (ex: `tZd61H2adMPsphEwGyDt` para Centurion).
   - **Access Token**: Private Integration Token (PIT) do GHL com escopos: `conversations.readonly`, `medias.readonly`, `contacts.readonly`, `opportunities.readonly`, `users.readonly`.
   - **Enabled**: toggle on.
4. Salvar — o backend gera automaticamente um `webhookSecret` aleatório (32 bytes hex).
5. Copiar a configuração exibida (URL + headers `X-GHL-Location-Id`, `X-AskMoses-Secret`) e colar no step de webhook do Pepper.

⚠️ **O `webhookSecret` em plaintext só aparece UMA VEZ na resposta de PATCH** (quando é gerado/regenerado). Depois disso só fica mascarado. Se perder, regenerar (vai invalidar o webhook atual).

### 4.3 Status atual (Centurion Canine)

| Campo | Valor |
|---|---|
| Org name | Centurion Canine LLC |
| `ghl_location_id` | `tZd61H2adMPsphEwGyDt` |
| `ghl_enabled` | true |
| `ghl_access_token` | (preenchido — confirmado via Vercel log `GET /rest/v1/organizations → 200`) |
| `ghl_webhook_secret` | (já configurado no Pepper) |

---

## 5. Variáveis de Ambiente

### 5.1 Obrigatórias (devem existir na Vercel)

| Variável | Valor | Onde usado |
|---|---|---|
| `SUPABASE_URL` | URL do projeto Supabase | DB access |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | DB access server-side |
| `OPENAI_API_KEY` | OpenAI API key | Whisper |

### 5.2 Opcionais (com default funcional)

| Variável | Default | Comentário |
|---|---|---|
| `GHL_API_BASE` | `https://services.leadconnectorhq.com` | **NÃO incluir `/v2` no path** — a versão é negociada via header `Version: 2021-04-15`. Se setada com `/v2`, endpoints retornam 404. |
| `PIPELINE_ALERT_WEBHOOK_URL` | (vazia → no-op) | Slack incoming webhook (ou compatível). Quando setada, alertas async vão pra ela em estados terminais de erro. |

### 5.3 O que NÃO existe (e não deve ser confundido)

A spec original (`AskMoses-GHL-StepByStep.md` antes do rewrite) mencionava env vars globais que **não fazem parte da implementação**:

- ❌ `GHL_WEBHOOK_SECRET` — secret é per-org no DB.
- ❌ `GHL_ACCESS_TOKEN` — access token é per-org no DB.
- ❌ `DEFAULT_ORG_ID` — org resolution é por header, sem fallback.

---

## 6. CONFIGURAÇÃO DO PEPPER (passo a passo)

Esta é a parte mais crítica do handoff. Siga **exatamente** estes passos, na ordem.

### 6.1 Acesso ao workflow

1. Logar no GHL com a conta que tem acesso à location `Centurion Canine LLC`.
2. Ir em **Automation** → **Workflows**.
3. Localizar o workflow **"New Workflow : 1779382682901"** (ou o nome em uso atual; é o que dispara em `Call Completion`).
4. Clicar para editar.

### 6.2 Localizar o step do webhook

1. Dentro do workflow, encontrar o step **`AskMoses-Centurion-Org`** (ou nome similar de "Send to Ask Moses").
2. Clicar para abrir a config do step.

### 6.3 Conferir / configurar o **Endpoint URL**

O step deve fazer POST para a URL fornecida pelo admin form do AskMoses. Formato:

```
https://<host>/api/webhooks/ghl
```

Onde `<host>` é:
- **Produção:** dependerá do dominio final do projeto (ex: `app.askmoses.ai`).
- **Preview (estado atual):** `askmoses-git-dev-drivegvslompo-4287s-projects.vercel.app` (preview da branch `dev` na Vercel).

⚠️ **Não incluir** sufixos depois de `/ghl` (ex: `/ghl/centurion` ou `/ghl?org=...`) — URL é única para todas as orgs.

### 6.4 Conferir / configurar os **Headers**

Na aba de headers do step:

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-GHL-Location-Id` | `tZd61H2adMPsphEwGyDt` |
| `X-AskMoses-Secret` | (o secret gerado no admin form do AskMoses — Victor já tem) |

**Importante:**
- Sem aspas em volta dos valores (mesma armadilha do `type`).
- `X-GHL-Location-Id` é exatamente o location ID da Centurion: `tZd61H2adMPsphEwGyDt`.

### 6.5 Configurar **Custom Data** (campo crítico)

Esta é a parte que estava errada. Substituir/adicionar exatamente as linhas abaixo. **Não confundir aspas/maiúsculas** — caracter a caracter.

| Key | Value | Tipo |
|---|---|---|
| `type` | `callCompleted` | **STRING LITERAL** — não envolver em aspas, não usar merge tag. Digitar exatamente as 13 letras `callCompleted` (c-a-l-l-C-o-m-p-l-e-t-e-d). |
| `contactId` | `{{contact.id}}` | merge tag |
| `userId` | `{{phoneCall.user.id}}` | merge tag |
| `callStatus` | `{{phoneCall.callStatus}}` | merge tag |
| `callDirection` | `{{phoneCall.direction}}` | merge tag |
| `userName` | `{{phoneCall.user.name}}` | merge tag (opcional mas recomendado) |
| `userEmail` | `{{user.email}}` | merge tag (opcional) |
| `contactName` | `{{contact.name}}` | merge tag (opcional) |
| `duration` | `{{phoneCall.duration}}` | merge tag (opcional) |
| `contactSource` | `{{contact.source}}` | merge tag (opcional) |
| `contactEmail` | `{{contact.email}}` | merge tag (opcional) |

**Como verificar se você digitou `type` corretamente após salvar:**
- Olhar o "Save Preview" ou o JSON gerado pelo Pepper antes de publicar.
- O valor deve aparecer como `"type": "callCompleted"` no preview — **sem aspas internas** (ex: ❌ `"type": "\"callCompleted\""`).

**Por que `type` não pode ser merge tag:** o GHL não tem uma variável que retorne literalmente "callCompleted". É só um discriminador que o handler do AskMoses usa pra confirmar que esse webhook é o evento esperado (no futuro pode haver outros tipos como `callMissed`, `smsReceived`, etc.).

### 6.6 Salvar e publicar

1. Clicar **Save** no step.
2. Voltar pro workflow e clicar **Publish** (importante! sem publish, alterações não ficam ativas).

### 6.7 Erros comuns no Pepper

| O que parece estar certo na UI | O que vai chegar no body |
|---|---|
| Value: `"callCompleted"` (com aspas) | `"type": "\"callCompleted\""` → ❌ falha |
| Value: `callCompleted ` (espaço no final) | `"type": "callCompleted "` → ✅ defensiva trim cobre |
| Value: `Callcompleted` (case errado) | `"type": "Callcompleted"` → ❌ falha (case-sensitive) |
| Value: `{{...}}` (qualquer merge tag) | `"type": "<resolved value>"` → ❌ não vai ser `callCompleted` |

---

## 7. Como Testar End-to-End

### 7.1 Pré-checks (antes de disparar a primeira chamada)

Executar **nessa ordem**:

**1. Confirmar que a org está habilitada no AskMoses:**

```sql
-- Rodar no Supabase SQL Editor:
SELECT id, name, ghl_location_id, ghl_enabled,
       ghl_access_token IS NOT NULL AS has_token,
       ghl_webhook_secret IS NOT NULL AS has_secret
FROM organizations
WHERE ghl_location_id = 'tZd61H2adMPsphEwGyDt';
```

Esperado:
- 1 linha
- `ghl_enabled = true`
- `has_token = true`
- `has_secret = true`

Se algum falhar → voltar pra seção 4.2 e configurar via admin.

**2. Confirmar env var `GHL_API_BASE` na Vercel:**

- Vercel Dashboard → projeto → Settings → Environment Variables.
- Procurar `GHL_API_BASE` em Production E Preview.
- Se setada: deve ser `https://services.leadconnectorhq.com` (sem `/v2`).
- Se não setada: OK (default no código está correto).

**3. (Opcional) Configurar alerta async:**

- Criar Slack Incoming Webhook (Slack workspace → Apps → Incoming Webhooks → Add to Slack).
- Vercel Dashboard → Settings → Environment Variables → adicionar:
  - Name: `PIPELINE_ALERT_WEBHOOK_URL`
  - Value: a URL do webhook Slack.
  - Environments: Production + Preview.
- Redeploy.

### 7.2 Disparar a primeira chamada de teste

**Cenário ideal:** contato real no GHL que tem uma call já completed e com gravação.

1. No GHL, abrir um contato que sabidamente tem call gravada (verificar em "Conversations" do contato — deve ter uma mensagem do tipo CALL com áudio).
2. Disparar manualmente o workflow "New Workflow : 1779382682901" para esse contato (ou esperar uma call real terminar se workflow tem trigger automático).

**Cenário de teste forçado** (se não há call real disponível):

1. No Pepper, ir no step `AskMoses-Centurion-Org`.
2. Clicar em "Test" (se disponível) ou disparar o workflow manualmente em um contato qualquer.
3. A primeira chamada provavelmente vai cair em `no_recording` (esperado — contato sem áudio), mas valida que o webhook foi recebido e o auth passou.

### 7.3 Verificar resultado em cada camada

**Camada 1 — Pepper Event Details:**

- GHL → Workflow → **Execution Logs** → encontrar a execução recente.
- Clicar no step `AskMoses-Centurion-Org`.
- Ver "Event Details → Info":
  - **Status: 200** → 🟢 webhook foi aceito.
  - Body deve conter: `{"data":{"callId":"<uuid>","status":"received"},"error":null}` ou `..."status":"duplicate"...`.
  - Status diferente de 200 → ver tabela de erros na seção 8.

**Camada 2 — Vercel Function Logs:**

- Vercel Dashboard → projeto → Logs → filtrar por `/api/webhooks/ghl`.
- Procurar a entrada da execução:
  - Method: `POST`, Status: `200`, Duration: ~500-1500ms (cold start adiciona ~400ms).
  - **Não deve aparecer** `[ghl-webhook] type-check failed` — se aparecer, voltar à seção 6.5.
- Pipeline async aparece em um log separado:
  - Após ~70-110s, esperar um log do pipeline (sem erro = sucesso).
  - Se erro: procurar prefixos `[ghl-pipeline]` ou `[ghl-webhook]`.

**Camada 3 — Supabase:**

```sql
SELECT id, external_call_id, trainer_name, client_name,
       processing_status, transcript_source,
       LENGTH(transcript) AS transcript_chars,
       created_at, updated_at
FROM calls
WHERE org_id = (SELECT id FROM organizations
                WHERE ghl_location_id = 'tZd61H2adMPsphEwGyDt')
ORDER BY created_at DESC
LIMIT 5;
```

Esperado:
- Nova linha com `external_call_id` começando com `ghl_<64-hex>`.
- `processing_status` evolui na seguinte ordem ao longo de ~110s:
  - `pending` (instantâneo após webhook)
  - `processing` (logo após o `after()` iniciar)
  - `transcribed` (final, ~70-110s depois)
- Se for terminal de erro: `no_recording` | `transcription_failed` | `webhook_failed`.
- `transcript` deve estar não-vazio se `processing_status = 'transcribed'`.

**Camada 4 — UI do AskMoses (se aplicável):**

- Logar no admin → ver a call na listagem da org.
- Conferir trainer_name (`Sarah Schaefer` no exemplo), duration, etc.

### 7.4 Casos de falha esperados (e como diagnosticar)

| `processing_status` | Significado | O que verificar |
|---|---|---|
| `no_recording` | GHL não tinha gravação acessível para o contato | (1) O contato tem mesmo uma call com áudio? (2) `accessToken` da org tem escopos `conversations.readonly` + `medias.readonly`? (3) GHL processa áudio com delay — talvez precise esperar antes de retentar manualmente. |
| `transcription_failed` | Áudio baixou mas Whisper falhou 3x | (1) `OPENAI_API_KEY` válida na Vercel? (2) Arquivo de áudio muito grande (>200MB)? Vercel logs vão ter `[ghl-pipeline] Whisper attempt failed`. |
| `webhook_failed` | Pipeline crashou de forma inesperada | Vercel logs `[ghl-webhook] pipeline crashed` com stack trace. |

---

## 8. Estados HTTP do Handler (referência)

Todas as respostas seguem o formato:

```jsonc
// Sucesso:
{ "data": <T>, "error": null }

// Erro:
{ "data": null, "error": { "message": "...", "code": <httpCode> } }
```

### 8.1 Tabela de respostas

| HTTP | `error.message` | Causa | Onde corrigir |
|---|---|---|---|
| 200 | (n/a — sucesso) | Webhook aceito, pipeline disparado | — |
| 400 | `"X-GHL-Location-Id header required"` | Header faltando | Pepper headers |
| 400 | `"Invalid JSON"` | Body não parseou | Pepper body (improvável com Custom Data) |
| 400 | `"Missing customData in webhook body"` | Body não tem `customData` | Pepper Custom Data inteiro está vazio |
| 400 | `"Unsupported webhook type: <valor>"` | `type` ≠ `callCompleted` (mesmo com normalize) | Pepper Custom Data linha `type` |
| 400 | `"contactId is required"` | `customData.contactId` ausente ou vazio | Pepper Custom Data linha `contactId` |
| 401 | `"Unauthorized"` | `X-AskMoses-Secret` não bate com o do DB | Conferir secret no admin form vs Pepper headers; se necessário, regenerar |
| 404 | `"Unknown or disabled location"` | `X-GHL-Location-Id` não existe no DB OU `ghl_enabled = false` | Admin form `/admin/organizations/.../integrations/ghl` |
| 500 | `"Server error"` | Falha no lookup do DB | Vercel logs `[ghl-webhook] lookup failed` |
| 500 | `"Failed to persist call"` | Upsert do DB falhou | Vercel logs `[ghl-webhook] upsert failed` |

### 8.2 Como ler o log diagnóstico de `type-check failed`

Em [route.ts:66-72](../app/api/webhooks/ghl/route.ts#L66-L72), quando o `type` é rejeitado, o handler loga:

```jsonc
"[ghl-webhook] type-check failed", {
  "receivedType": "<o que chegou no payload.type>",
  "customDataKeys": ["contactId", "userId", ...],
  "rootKeys": ["contact_id", "location", "workflow", ...]
}
```

- Se `receivedType` é `undefined` → campo `type` não está no Custom Data.
- Se `receivedType` tem aspas (ex: `"\"callCompleted\""`) → defensiva normalize não cobriu; possível aspas múltiplas ou outro charset.
- Se `customDataKeys` está vazio → Pepper está enviando body sem Custom Data (estranho).
- Se `customDataKeys` tem os outros campos mas não tem `type` → Pepper esqueceu de adicionar a linha.

---

## 9. Limitações Atuais e Roadmap

### 9.1 O que **NÃO** está implementado (por design, próximas leva)

- **Scoring com rubric** — o pipeline atual termina em `transcribed`. Próxima leva: classificação + LLM scoring + storage.
- **Coaching email** — depende do scoring; vem junto.
- **Retry com backoff em `fetchRecordingUrl`** — GHL processa áudio async, primeiro hit pode achar `no_recording` injustamente. Hoje aceita; próxima leva adiciona backoff exponencial.
- **Match de gravação por timing/duration** — `fetchRecordingUrl` hoje pega a call mais recente do contato; se houver múltiplas calls próximas, pode pegar a errada. Próxima leva adiciona filtro por janela de tempo + ±duration.
- **OAuth multi-tenant para GHL** — hoje cada org armazena um Private Integration Token (PIT) manual. Próxima leva: fluxo OAuth proper.
- **UI de alertas no admin** — alertas hoje só vão pro Slack (se configurado). Próxima leva: dashboard de falhas.
- **Agregação/dedupe de alertas** — todo erro vira um Slack post. Se virar barulho, agregar.

### 9.2 Concerns conhecidas (de revisão de código anterior)

A revisão do Victor de ontem identificou outros pontos válidos que ficaram fora desta leva:

- **#6 (recording match)** — descrito acima.
- **#11 (retry de gravação)** — descrito acima.

Outros pontos da revisão dele referiam-se à **spec antiga** (não ao código real) — ver a nota de code-drift no topo de [AskMoses-GHL-StepByStep.md](./AskMoses-GHL-StepByStep.md).

---

## 10. Checklist Final Pré-Teste

Antes de disparar o primeiro teste real, confirmar:

- [ ] Org Centurion tem `ghl_enabled=true` + token + secret no Supabase (seção 7.1 query 1)
- [ ] `GHL_API_BASE` na Vercel é correta (sem `/v2`) ou unset (seção 7.1 step 2)
- [ ] Branch `feat/ghl-integration` com commits `cef2b42` e `3392566` deployada no preview/prod
- [ ] Deployment Protection da Vercel desabilitada no preview alvo (Pablo confirmou ontem)
- [ ] Pepper step `AskMoses-Centurion-Org` com:
  - [ ] URL apontando pro deployment certo
  - [ ] Headers `X-GHL-Location-Id` + `X-AskMoses-Secret` corretos
  - [ ] Custom Data com `type` = `callCompleted` SEM aspas (seção 6.5)
  - [ ] Custom Data com `contactId` = `{{contact.id}}`
  - [ ] Workflow republicado após mudança
- [ ] (Opcional) `PIPELINE_ALERT_WEBHOOK_URL` configurada na Vercel
- [ ] Acesso aberto a: Vercel Logs, Supabase SQL editor, Pepper Execution Logs

Depois disso, disparar e seguir a seção 7.3 pra validar cada camada.

---

## 11. Quando algo der errado — fluxo de diagnóstico

```
┌─────────────────────────────────────┐
│ Pepper Event Details — qual status? │
└─────────────────────────────────────┘
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
 200       4xx/5xx     Pending/timeout
   │          │              │
   │          ▼              ▼
   │   Ver body do erro    Vercel deployment
   │   (seção 8.1)         responde? URL certa?
   │
   ▼
 Vercel Logs — pipeline async rodou?
   │
   ├─ Não rodou (sem log de [ghl-pipeline]):
   │    → after() não disparou. Verificar runtime.
   │
   ├─ Rodou e terminou em transcribed:
   │    → ✅ Sucesso. Confirmar no Supabase.
   │
   └─ Rodou e terminou em estado de erro:
        → Ver processingStatus no Supabase
        → Cruzar com tabela 7.4
```

---

## 12. Rotação do PIT (Private Integration Token)

Quando o owner da location GHL rotaciona o PIT no Pepper (o que pode acontecer por segurança ou rotina), nosso DB continua com o token antigo, agora inválido. O sistema lida com isso assim:

### Detecção automática

[lib/services/ghl-api.ts](../lib/services/ghl-api.ts) exporta `GhlAuthError`. Quando uma chamada de API retorna 401 ou 403:
- `fetchRecordingUrl` → throw `GhlAuthError` (no `/conversations/search` ou no `/conversations/{id}/messages`).
- `downloadRecording` → throw `GhlAuthError` (depois de tentar com e sem Bearer).

O pipeline em [lib/services/ghl-call-pipeline.ts](../lib/services/ghl-call-pipeline.ts) intercepta `GhlAuthError` especificamente e:
1. Marca a call como `processing_status = 'auth_expired'`.
2. Atualiza `organizations.ghl_last_auth_error_at` com timestamp atual.
3. Dispara alerta `auth_expired` no Slack (se `PIPELINE_ALERT_WEBHOOK_URL` configurado).

### UX no admin

`/admin/organizations/<id>/integrations/ghl` mostra banner vermelho se `ghl_last_auth_error_at` for menor que 24h. O banner indica explicitamente que o PIT foi rotacionado e pede que o admin cole o token novo.

Quando admin cola novo token e clica Salvar:
- `dbUpdateOrgGhlConfig` limpa `ghl_last_auth_error_at = NULL` automaticamente.
- Banner some no próximo load.

### Calls afetadas

Calls que ficaram em `auth_expired` **não retentam automaticamente**. Comportamento esperado:
- Calls novas (depois do token atualizado) processam normalmente.
- Calls antigas em `auth_expired` ficam visíveis no admin com esse status. Se forem críticas, opções:
  - Disparar o workflow novamente no Pepper pro mesmo contato — vai cair em `duplicate` se nada mudou (idempotência via hash).
  - Reset manual via SQL (gambiarra): `UPDATE calls SET processing_status='pending', transcript=NULL, recording_url=NULL WHERE id='<uuid>'`. Mas sem endpoint de "reprocess" hoje, só reseta o status.

### Migration

`scripts/046_ghl_auth_error_tracking.sql` adiciona:
- `'auth_expired'` ao CHECK constraint de `calls.processing_status`.
- Coluna `organizations.ghl_last_auth_error_at TIMESTAMPTZ`.

Idempotente — pode rodar várias vezes.

---

## Apêndice — Referências cruzadas

- [docs/AskMoses-GHL-StepByStep.md](./AskMoses-GHL-StepByStep.md) — guia de implementação original (Steps 1-4 reescritos hoje pra refletir código real)
- [docs/GHL-Webhook-Pepper-Setup.md](./GHL-Webhook-Pepper-Setup.md) — handoff curto pro Victor (menos detalhe técnico, foco em ações)
- Commits hoje: `cef2b42` (alerts + handoff doc) e `3392566` (rewrite Steps 1-4)
- Commit do fix de ontem: já mergeado pré-sessão
