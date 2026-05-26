# AskMoses.AI — GHL Integration: Step-by-Step Implementation Guide

**Infrastructure:** Vercel Teams (5 seats, Fluid Compute) + Supabase Pro  
**Objective:** When a call completes in GoHighLevel (Pepper CRM), AskMoses receives it, transcribes if needed, scores it, and generates a coaching email. Zero manual upload.  
**Date:** May 2026 | **For:** Dev Team (Tupay, Vitor Milanez, Lucas, Mateus)  
**By:** Victor Slompo

---

> **Code-drift note (updated 2026-05-22):** Steps 1-4 below describe the **actual code in production**, not the original implementation spec. The implementation diverged from the spec on several important points: auth check happens **before** body parse, idempotency uses a deterministic SHA-256 hash (not `Date.now()`), access tokens are **per-org in the DB** (not a global env var), background processing uses Next 15's `after()` (not `import('next/server').waitUntil`), and the current pipeline ends at `transcribed` (scoring/coaching email are future features).
>
> If you're making structural changes, edit the code first and update this doc in the same PR — don't trust outdated examples in older revisions of this file.

---

## Infrastructure Constraints

| Platform | Plan | Key Limits |
|---|---|---|
| **Vercel** | Teams (5 seats) | Fluid Compute: **800s max** per function (Pro/Teams). Default 300s. `waitUntil()` for background processing. 4GB RAM / 2 vCPU on Performance tier. |
| **Supabase** | Pro | 500MB DB, 50K MAU, 8GB storage. RLS enabled. pg_cron available. Edge Functions available but NOT needed for this integration. |

**Architecture decision:** Everything runs on Vercel Functions. No Azure, no Supabase Edge Functions. Vercel Teams with Fluid Compute gives us 800s timeout — more than enough for the full pipeline (~90s with Whisper, ~30s without).

---

## GHL Credentials

| Item | Value / Source |
|---|---|
| App name | AskMosesInt (API v2.0) |
| Location ID | **Per-org**, stored in `organizations.ghl_location_id`. Sent in the webhook request via `X-GHL-Location-Id` header (the handler uses the header for org resolution, not a payload field). |
| Access Token | **Per-org**, stored in the org record. Pipeline reads it for each call — no global env var. |
| API Base | `https://services.leadconnectorhq.com` (no `/v2` path — version is pinned via `Version: 2021-04-15` header) |
| Scopes | conversations, objects/schema, objects/record, medias, templates, tags, redirects, products, **contacts, opportunities, users** (all .readonly) |
| Workflow | "Call Completion Notification" → Send to Ask Moses → Email Check Confirmation |

---

## Webhook Payload (How GHL Actually Sends It)

**Important — actual structure differs from what's configured.** Fields you add to GHL's "Custom Data" UI are nested under `customData` in the request body. The root of the body has GHL's native fields (contact, location, workflow, message, etc.). The handler reads from `body.customData`, NOT from `body` directly.

### Configure in GHL Pepper (Custom Data tab of the webhook action)

| Key | Value | Notes |
|---|---|---|
| `type` | `callCompleted` | **Literal string, no quotes, no merge tag** |
| `contactId` | `{{contact.id}}` | |
| `userId` | `{{phoneCall.user.id}}` | |
| `callStatus` | `{{phoneCall.callStatus}}` | |
| `callDirection` | `{{phoneCall.direction}}` | |
| `userName` | `{{phoneCall.user.name}}` | |
| `userEmail` | `{{user.email}}` | |
| `contactName` | `{{contact.name}}` | |
| `duration` | `{{phoneCall.duration}}` | |
| `contactSource` | `{{contact.source}}` | |
| `contactEmail` | `{{contact.email}}` | |

When typing `callCompleted` in the Pepper Value field, do **not** wrap it in quotes — GHL treats whatever you type as the literal string value. Typing `"callCompleted"` stores the quotes as part of the string and the handler rejects it (`Unsupported webhook type: "callCompleted"`).

### What GHL actually sends (root has native fields, custom data is nested)

```jsonc
{
  // Native GHL fields at root — we don't control these:
  "contact_id": "xSCSxSknhx4hQwUEb9GV",
  "first_name": "...", "last_name": "...", "email": "...",
  "location": { "id": "<locationId>", "name": "...", "address": "..." },
  "workflow": { "id": "...", "name": "..." },
  "message": { "type": 1 },
  "contact": { /* full contact object */ },

  // Fields we added via Custom Data — nested under customData:
  "customData": {
    "type": "callCompleted",
    "contactId": "xSCSxSknhx4hQwUEb9GV",
    "userId": "...",
    "callStatus": "completed",
    "callDirection": "outbound",
    "userName": "Sarah Schaefer",
    "userEmail": "...",
    "contactName": "...",
    "duration": "34",
    "contactSource": "...",
    "contactEmail": "..."
  }
}
```

The handler validates `body.customData.type === "callCompleted"` and reads the other fields from the same `customData` object. The whole raw envelope (root + customData) is persisted to `calls.ghl_payload` for debugging — `location.id` and `workflow.name` at root are useful when investigating.

**Note:** `recordingUrl` is NOT available as a Pepper workflow variable. The backend fetches it via GHL Conversations API using the `contactId`. **Audio is mandatory** — all transcription is done via OpenAI Whisper. GHL's built-in transcript is not used due to quality issues, so the `transcript` Custom Data field is omitted (handler doesn't read it anyway).

---

## Step-by-Step Implementation

### STEP 1 — Webhook endpoint

**File:** [`app/api/webhooks/ghl/route.ts`](../app/api/webhooks/ghl/route.ts)

Single POST handler. Runtime: `nodejs`, `maxDuration: 300` (Vercel Teams Fluid Compute supports up to 800s; 300s is comfortable headroom for download + Whisper).

**Request contract:**

- Method: `POST`
- Path: `/api/webhooks/ghl` (single URL for all orgs)
- Required headers:
  - `X-GHL-Location-Id` — identifies the org. Looked up against `organizations.ghl_location_id`.
  - `X-AskMoses-Secret` — per-org secret, validated with `crypto.timingSafeEqual`.
- Body: JSON. Custom Data fields live under `body.customData` (see "Webhook Payload" section above for full shape).

**Behavior, in order:**

1. Read `X-GHL-Location-Id` header → 400 if missing.
2. Look up org config (`dbGetOrgGhlConfigByLocation`) → 404 if location unknown or integration disabled.
3. Validate `X-AskMoses-Secret` against the org's stored secret → 401 if mismatch.
4. Parse body as `GhlRawWebhookBody` → 400 on invalid JSON.
5. Extract `body.customData` → 400 if missing.
6. Normalize `customData.type` (`.trim().replace(/^"+|"+$/g, "")`) and require `=== "callCompleted"` → 400 with `console.warn` dumping `customDataKeys` + `rootKeys` if not.
7. Require non-empty `customData.contactId` → 400.
8. Build deterministic `externalCallId` via SHA-256 of `contactId | userId | callStatus | callDirection | duration` ([`buildExternalCallId`](../lib/services/ghl-helpers.ts)). Same payload retried by GHL hits the same hash → upsert returns `isNew: false` and the handler responds `{ status: "duplicate" }` instead of double-processing.
9. Upsert the call row, persisting the **full raw body** (root + customData) to `ghl_payload` for debugging.
10. Dispatch the async pipeline via Next 15's `after(processGhlCall(...))` from `next/server`. **Do not use** dynamic `import('next/server').waitUntil` — that pattern was in the original spec but `after` is the correct App Router API.
11. Return `{ data: { callId, status: "received" | "duplicate" }, error: null }` immediately.

**Response shape (success):**

```jsonc
{ "data": { "callId": "<uuid>", "status": "received" }, "error": null }
```

**Response shape (error):** `{ "data": null, "error": { "message": "...", "code": <httpCode> } }`. Status codes: 400 (validation), 401 (auth), 404 (unknown location), 500 (DB / server).

---

### STEP 2 — Helpers and types

**File:** [`lib/services/ghl-helpers.ts`](../lib/services/ghl-helpers.ts)

Pure functions and types used by the handler. **No org resolution here** — that's done in the handler via header.

| Symbol | What it does |
|---|---|
| `GhlWebhookPayload` | TypeScript type representing the shape of `body.customData` (the fields configured in Pepper). |
| `GhlRawWebhookBody` | Envelope type — has `customData?: GhlWebhookPayload`, plus native GHL root fields (`location`, `workflow`). Used by the handler for body typing. |
| `normalizeEmpty(value)` | Trims whitespace; returns `null` for empty or whitespace-only strings. |
| `normalizeSource(source)` | Lowercases and maps to `LeadSource` enum (`facebook` \| `google` \| `organic` \| `referral` \| `other`). Unknown values → `"other"`. |
| `parseDuration(value)` | Parses `string \| number` to integer seconds or `null`. |
| `detectCallType(direction, contactId)` | Maps GHL `direction` to internal call type. `inbound` → `cold_inbound` (TODO: distinguish warm vs cold via history); other → `scheduled_followup`. |
| `buildExternalCallId(payload)` | Deterministic SHA-256 hash of stable payload fields (no timestamp). Returns `ghl_<64-hex>`. Used as `external_call_id` for the UNIQUE INDEX-backed idempotency. |

---

### STEP 3 — Background pipeline

**File:** [`lib/services/ghl-call-pipeline.ts`](../lib/services/ghl-call-pipeline.ts)

Triggered by `after(processGhlCall(callId, payload, options))` from the handler. Receives the **per-org access token** via `options.accessToken` — no global env var.

**Current pipeline ends at `transcribed`.** It deliberately does **not** do scoring, classification, or coaching email — those are future features that will plug in at the `transcribed` terminal state. The original spec described all five stages, but the implementation was cut to land transcription cleanly first.

**Terminal states:**

| `processingStatus` | Meaning |
|---|---|
| `transcribed` | Success. Transcript stored in `calls.transcript`, `transcriptSource: "whisper"`. |
| `no_recording` | `fetchRecordingUrl` threw or returned null. No audio available in GHL for the contact (yet — see "retry consideration" below). |
| `transcription_failed` | Audio downloaded but Whisper failed 3 times (delays `0, 1500, 4000` ms) or download itself failed. |
| `webhook_failed` | Pipeline crashed unexpectedly — handler catches and marks this state. |

**Side effect on each terminal failure:** the pipeline calls [`notifyPipelineFailure`](../lib/services/pipeline-alerts.ts) (best-effort POST to `PIPELINE_ALERT_WEBHOOK_URL` if configured). Pipeline keeps running if the alert call fails — it's purely observability.

**Vercel Blob is not used.** Whisper receives the audio `Buffer` directly via `transcribeAudioBuffer(audio.buffer, audio.mimeType)`. No `BLOB_READ_WRITE_TOKEN` required.

**Retry consideration:** `fetchRecordingUrl` does **not** retry today. GHL processes call audio asynchronously, so a webhook that fires immediately on call end can hit before the recording is ready. Adding exponential backoff is on the follow-up list — for now, expect occasional spurious `no_recording`.

---

### STEP 4 — GHL API client

**File:** [`lib/services/ghl-api.ts`](../lib/services/ghl-api.ts)

Two exported functions. Base URL comes from `GHL_API_BASE` env (default `https://services.leadconnectorhq.com`, no `/v2` — API version is pinned via `Version: 2021-04-15` header on every request).

**`fetchRecordingUrl(contactId, accessToken)` → `Promise<RecordingRef | null>`**

1. `GET /conversations/search?contactId=<id>&limit=5` — lists up to 5 conversations for the contact.
2. For each conversation: `GET /conversations/<id>/messages`. Filters messages by `isCallMessage` (handles both string `"CALL"` and numeric type codes `25` / `26` for `CALL_INBOUND` / `CALL_OUTBOUND`).
3. Sorts call messages by `dateAdded` DESC (most recent first).
4. For each: tries `meta.call.recordingUrl`, then iterates `attachments[]` looking for a URL.
5. Returns the first hit as `{ url, messageId, conversationId }`, or `null` if nothing matches.

**Note on the matching logic:** today the function picks the most recent call message with a recording — it doesn't validate against the webhook's `duration` or timing window. If a contact has multiple recent calls, the latest one wins (which is correct in the common case). Refining the match by timing/duration is on the follow-up list.

**`downloadRecording(url, accessToken)` → `Promise<DownloadedRecording>`**

1. First attempts the fetch with `Authorization: Bearer <token>` (some GHL recording URLs are API endpoints in disguise and require auth).
2. On `401` or `403`, retries **without** the auth header (S3 pre-signed URLs reject the Bearer and fail otherwise).
3. Enforces a 200 MB cap (defensive — both via `content-length` header and after read).
4. Returns `{ buffer, mimeType, byteLength }`. MIME is read from `content-type` or defaults to `audio/mpeg`.

---

### STEP 5 — Supabase schema additions

**Migration:** `scripts/ghl_integration.sql`

```sql
-- Add GHL-specific fields to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS external_call_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'manual'
  CHECK (transcript_source IN ('whisper', 'manual'));
ALTER TABLE calls ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending'
  CHECK (processing_status IN (
    'pending', 'processing', 'completed', 'completed_no_score',
    'no_recording', 'no_rubric', 'transcription_failed', 'analysis_failed'
  ));

-- Idempotency index
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_external_id
  ON calls(external_call_id) WHERE external_call_id IS NOT NULL;

-- Add GHL location mapping to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;

-- Update existing org with GHL location
UPDATE organizations
  SET ghl_location_id = 'l2VVQax2pxKTUZWYYsW0'
  WHERE name ILIKE '%centurion%' OR name ILIKE '%taking%';
```

**Note:** `lead_name`, `caller_name`, `call_type`, `call_subtype`, `sections_json`, `overall_score`, `suggested_outcome` should already exist from TASK-F2-004. If not, add them per DM-02 in Business Rules.

---

### STEP 6 — Vercel environment variables

Add in **Vercel Dashboard → Project Settings → Environment Variables:**

| Variable | Value | Required | Environments |
|---|---|---|---|
| `GHL_API_BASE` | `https://services.leadconnectorhq.com` (no `/v2`) | Optional — defaults to this | Production, Preview |
| `PIPELINE_ALERT_WEBHOOK_URL` | Slack incoming webhook URL (or compatible endpoint) | Optional — no alerts emitted if unset | Production, Preview |

**GHL credentials are per-org, not env vars.** Each org's `ghl_location_id`, `accessToken`, and webhook secret are stored in `organizations` (set via the admin panel at `/admin/organizations/.../integrations/ghl`). There are no global `GHL_WEBHOOK_SECRET`, `GHL_ACCESS_TOKEN`, or `DEFAULT_ORG_ID` env vars.

**Also verify these already exist:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for Whisper)

---

### STEP 7 — Enable Fluid Compute on Vercel

1. Go to **Vercel Dashboard → Project → Settings → Functions**
2. Ensure **Fluid Compute** is enabled (should be default on Teams)
3. Set **Default Max Duration** to 300s
4. The webhook route uses `export const maxDuration = 300` which gives 5 minutes

If Fluid Compute is NOT enabled:
1. Go to **Project Settings → General → Fluid Compute**
2. Toggle ON
3. Redeploy

---

### STEP 8 — Add security header in GHL webhook

1. Open GHL Workflow: "Call Completion Notification"
2. Click on "Send to Ask Moses" action
3. In **HEADERS** section (below custom data), add:

| Header | Value |
|---|---|
| Content-Type | application/json ✅ already set |
| X-AskMoses-Secret | amws_2026_askmoses_secret |

4. Save workflow

---

### STEP 9 — Deploy and test

**Deployment checklist:**
```
□ Migration scripts/ghl_integration.sql applied to Supabase
□ Environment variables set in Vercel
□ Fluid Compute enabled
□ GHL webhook has X-AskMoses-Secret header
□ Deploy to preview branch first
□ Update webhook URL in GHL to preview URL for testing
```

**Test flow:**
1. In Pepper (GHL), create a test contact
2. Make a test call to that contact (or use an existing completed call)
3. Trigger the workflow manually (or wait for auto-trigger)
4. Check Vercel Function logs: does the webhook arrive?
5. Check Supabase: is the call record created with status "pending"?
6. Wait 30-120s: does status change to "completed"?
7. Check: does the call have transcript, sections_json, overall_score?
8. Check: was coaching email generated?

**Debugging:**
```
Vercel Logs → Filter by /api/webhooks/ghl
Supabase → calls table → sort by created_at desc
GHL → Workflow → Execution Logs
```

---

## Pipeline Timing (Expected — current scope: ends at `transcribed`)

| Step | Time | Stage |
|---|---|---|
| Receive + validate + upsert | <1s | sync (handler) |
| Return 200 to GHL | <1s | sync (handler) |
| Fetch recording via GHL API (search + messages) | 2-5s | async (pipeline) |
| Download audio (Bearer or S3 pre-signed) | 5-15s | async (pipeline) |
| Whisper transcription (30 min call, with up to 3 retries) | 60-90s | async (pipeline) |
| **Total to `transcribed`** | **~70-110s** | |

Well within the 300s `maxDuration` of the route (Vercel Teams Fluid Compute supports 800s).

> Future stages (classification, rubric scoring, coaching email) will add ~15-40s and ~$0.03 per call when implemented.

---

## Cost Per Call (current scope)

| Component | Cost |
|---|---|
| Whisper transcription (30 min) | ~$0.18 |
| Vercel compute (~90s) | ~$0.002 |
| **Total per call** | **~$0.18** |
| **At 500 calls/month** | **~$90/mo** |

All transcription runs through OpenAI Whisper. GHL transcript is not used. Vercel Blob is not used in the current pipeline — audio is streamed directly to Whisper as a Buffer.

> Future LLM scoring + coaching email will add ~$0.02-0.03 per call.

---

## File Structure Summary

```
app/
  api/
    webhooks/
      ghl/
        route.ts                ← STEP 1: Webhook endpoint
lib/
  services/
    ghl-helpers.ts              ← STEP 2: Types, normalize, hash for idempotency
    ghl-api.ts                  ← STEP 4: fetchRecordingUrl, downloadRecording
    ghl-call-pipeline.ts        ← STEP 3: Async pipeline (ends at `transcribed`)
    pipeline-alerts.ts          ← Best-effort Slack alert for pipeline failures
    whisper.ts                  ← transcribeAudioBuffer wrapper
scripts/
  ghl_integration.sql           ← STEP 5: Schema migration
```

**Future files** (when scoring / coaching email land): `scoring.ts`, `prompt-assembler.ts`, `coaching-email.ts`, plus a step that plugs into the pipeline at the `transcribed` terminal state.

---

## Business Rules Reference

| Rule | Description |
|---|---|
| GHL-01 | POST only. 200 on success, 401 unauthorized, 500 on error |
| GHL-02 | Idempotency via external_call_id |
| GHL-03 | lead_name and lead_source optional. Empty string → null |
| GHL-04 | Unmapped lead_source → "other" |
| GHL-05 | No recording found in GHL → "no_recording", pipeline stops. **Audio is mandatory.** |
| GHL-06 | Whisper transcription failure after 3 retries → "transcription_failed" |
| GHL-07 | LLM failure → "analysis_failed", transcript preserved |
| GHL-08 | Call type from direction: inbound/no contact = cold_inbound |
| GHL-09 | Cold inbound: preparation sections flagged N/A |
| GHL-10 | Non-sales calls skip scoring entirely |
| GHL-11 | Auto-send coaching email if rep account exists |
| GHL-12 | Owner always gets BCC |
| GHL-13 | Old calls without new fields return null |
| GHL-14 | Rotate access token every 90 days |
| GHL-15 | One GHL location = one AskMoses org |
| GHL-16 | **GHL transcript is NOT used.** Quality too low. All transcription via Whisper. |
| GHL-17 | transcript_source is always 'whisper' for GHL-ingested calls. 'manual' for uploaded calls. |
| GHL-18 | Audio MUST be fetched and stored. Without audio, pipeline stops — no scoring possible. |

---

## Pending (blocked by Ariel)

| Item | Status | Needed for |
|---|---|---|
| Call Recording confirmed active | ✅ Done — recording visible in Pepper | Audio download works |
| Confirm all clients use LC Phone (Twilio inside Pepper) | Asked Ariel | Ensures recordings exist for all calls |
| GHL scopes (contacts, opportunities, users) | ✅ Done — Victor added | Enrichment API calls |

---

*This spec is the single source of truth for the GHL integration. No Azure, no Supabase Edge Functions. Vercel Teams + Supabase Pro handles everything.*
