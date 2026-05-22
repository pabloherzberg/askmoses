# GHL Webhook — Setup do Pepper e Notas do Fix

**Data:** 2026-05-22 · **Para:** Victor (Pepper) + time de dev
**Status:** Fix de código mergeado. Falta apenas ajuste no Pepper.

---

## Contexto

O webhook GHL estava retornando 400 com `Unsupported webhook type: undefined`. Duas causas:

1. **Estrutura do payload** — GHL aninha os campos de Custom Data dentro de `customData` no body. O handler antigo lia `body.type` mas o campo real fica em `body.customData.type`.
2. **Aspas literais no `type`** — ao digitar `"callCompleted"` (com aspas) no campo Value do Pepper, o GHL armazena as aspas como parte da string. O valor real chegava como `"callCompleted"` (com aspas), o que falha na comparação com `callCompleted`.

O lado código está corrigido (mergeado em 2026-05-21). Falta o Victor ajustar o `type` no Pepper para destravar a primeira chamada real.

---

## Mudanças no código (2026-05-21)

| Arquivo | O que mudou |
|---|---|
| [lib/services/ghl-helpers.ts](../lib/services/ghl-helpers.ts) | Novo tipo `GhlRawWebhookBody` representa o envelope com `customData`, `location`, `workflow`. `GhlWebhookPayload` agora representa a shape de `customData`. |
| [app/api/webhooks/ghl/route.ts](../app/api/webhooks/ghl/route.ts) | Parse em duas etapas: primeiro o envelope, depois extrai `customData`. Normaliza o valor `type` (trim + remove aspas no início/fim) antes de comparar. `console.warn` quando o type-check falha, com `customDataKeys` e `rootKeys` pra debug futuro. Persiste o `rawBody` completo em `ghl_payload` (não só `customData`) pra preservar contexto. |
| [docs/AskMoses-GHL-StepByStep.md](AskMoses-GHL-StepByStep.md) | Seção "Webhook Payload" atualizada com a estrutura real (root nativo + `customData` aninhado), tabela explícita de campos pra Pepper e aviso sobre não usar aspas no valor `type`. |

**Detalhe importante:** a normalização defensiva (`trim().replace(/^"+|"+$/g, "")`) só remove aspas duplas no início/fim — ainda assim, o ideal é digitar o valor limpo no Pepper, pra evitar confusão.

---

## O que o Victor tem que fazer no Pepper

1. Abrir o GHL → workflow **"New Workflow : 1779382682901"** → step `AskMoses-Centurion-Org`.
2. Em **Custom Data**, localizar a linha `type`:
   - **Apagar** o valor atual (que está como `"callCompleted"` com aspas).
   - **Digitar** literalmente: `callCompleted`
     - Sem aspas (nem simples, nem duplas).
     - Sem espaços antes ou depois.
     - Case-sensitive: `c` minúsculo, `C` maiúsculo no meio.
3. (Recomendado) Conferir/adicionar os campos opcionais — sem eles a call grava com nome de trainer "Unknown trainer", sem nome de lead, sem duração:

   | Key | Value |
   |---|---|
   | `userName` | `{{phoneCall.user.name}}` |
   | `userEmail` | `{{user.email}}` |
   | `contactName` | `{{contact.name}}` |
   | `duration` | `{{phoneCall.duration}}` |
   | `contactSource` | `{{contact.source}}` |
   | `contactEmail` | `{{contact.email}}` |

4. **Salvar** o action e **publicar** o workflow.
5. Disparar o workflow uma vez (chamada de teste ou contato com call gravada).

---

## Como validar end-to-end

Em ordem:

1. **Pepper Event Details** → Execution Logs → ver o step `AskMoses-Centurion-Org`:
   - Status: **200**
   - Body: `{ "data": { "callId": "...", "status": "received" }, "error": null }`
     - Se `status: "duplicate"`, é idempotência funcionando — uma execução anterior já processou essa call (mesmo `contactId`/`userId`/`callStatus`/`callDirection`/`duration`). Esperado em retry.

2. **Vercel Logs** (Dashboard → projeto → Logs) — filtrar por `/api/webhooks/ghl`:
   - Ver entrada `POST 200` com duração ~500-1500ms (cold start adiciona ~400ms).
   - **Não** deve aparecer `[ghl-webhook] type-check failed` — se aparecer, voltar ao passo 2 do Pepper acima e conferir o valor de `type`.

3. **Admin → Calls** (ou query no Supabase em `calls`):
   - Linha nova com `external_call_id` começando com `ghl_`.
   - `processing_status` evoluindo: `pending` → `processing` → `transcribed` (ou estado terminal de erro — ver abaixo).

4. **Pipeline async** — leva ~85-155s pro Whisper terminar (call de ~30min):
   - `processing_status: "transcribed"` → sucesso.
   - `processing_status: "no_recording"` → o GHL ainda não tinha a gravação disponível, ou o contato não tem call.
   - `processing_status: "transcription_failed"` → Whisper falhou 3x. Ver `[ghl-pipeline]` nos Vercel Logs.
   - `processing_status: "webhook_failed"` → o pipeline inteiro crashou. Ver `[ghl-webhook] pipeline crashed` nos Vercel Logs.

---

## Validações antes do primeiro teste

Antes do Victor disparar a primeira chamada real, vale checar essas duas coisas pra evitar surpresa:

### 1. Org está registrada e habilitada no admin

No admin form de integração GHL da org "Centurion Canine LLC":
- `locationId` salvo = `tZd61H2adMPsphEwGyDt` (o mesmo que o Pepper envia no header `X-GHL-Location-Id`).
- `accessToken` presente.
- Integração `enabled = true`.
- Secret `X-AskMoses-Secret` configurado no Pepper bate com o salvo no admin form.

### 2. Env var `GHL_API_BASE` na Vercel

A integração usa `services.leadconnectorhq.com` como base da API GHL. Se a env var `GHL_API_BASE` foi setada explicitamente na Vercel:

- ✅ **Correto:** `https://services.leadconnectorhq.com` (sem path, sem `/v2`).
- ❌ **Errado:** `https://services.leadconnectorhq.com/v2` — os endpoints retornam 404.

**Como conferir:** Vercel Dashboard → projeto → Settings → Environment Variables. Procurar `GHL_API_BASE` em Production e Preview.

Se a env var não estiver setada, o código usa o default correto ([lib/services/ghl-api.ts:1](../lib/services/ghl-api.ts#L1)) — sem ação necessária.

---

## Alerta opcional de falhas async (env nova)

Foi adicionado um helper de alerta best-effort em [lib/services/pipeline-alerts.ts](../lib/services/pipeline-alerts.ts). Quando o pipeline async cai em estado terminal de erro (`no_recording`, `transcription_failed`, `webhook_failed`), ele faz POST num webhook configurável.

**Como ativar:**

1. Criar um Slack Incoming Webhook (ou usar qualquer endpoint que aceite `{ text, attachments }`).
2. Adicionar env var na Vercel: `PIPELINE_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...`
3. Redeploy.

Se a env var não estiver setada, o helper é no-op — pipeline funciona normalmente sem alerta. Não bloqueia se o Slack estiver fora (best-effort).

---

## Próximos passos depois que o webhook funcionar

Já mapeados como follow-up (não bloqueiam o teste atual):

- Refinar `fetchRecordingUrl` pra validar timing/duration da call certa (hoje pega só a mais recente do contato).
- Retry com backoff em `fetchRecordingUrl` (GHL processa áudio async — primeiro hit pode achar `no_recording` injustamente).
- Implementar scoring + coaching email (fora do pipeline atual; pipeline termina em `transcribed`).
- Reescrever Steps 1-4 da doc [AskMoses-GHL-StepByStep.md](AskMoses-GHL-StepByStep.md) pra refletir o código real (a spec original divergiu da implementação).
