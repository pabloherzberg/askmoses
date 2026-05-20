# AskMoses.AI — GHL Integration: Step-by-Step Implementation Guide

**Infrastructure:** Vercel Teams (5 seats, Fluid Compute) + Supabase Pro  
**Objective:** When a call completes in GoHighLevel (Pepper CRM), AskMoses receives it, transcribes if needed, scores it, and generates a coaching email. Zero manual upload.  
**Date:** May 2026 | **For:** Dev Team (Tupay, Vitor Milanez, Lucas, Mateus)  
**By:** Victor Slompo

---

## Infrastructure Constraints

| Platform | Plan | Key Limits |
|---|---|---|
| **Vercel** | Teams (5 seats) | Fluid Compute: **800s max** per function (Pro/Teams). Default 300s. `waitUntil()` for background processing. 4GB RAM / 2 vCPU on Performance tier. |
| **Supabase** | Pro | 500MB DB, 50K MAU, 8GB storage. RLS enabled. pg_cron available. Edge Functions available but NOT needed for this integration. |

**Architecture decision:** Everything runs on Vercel Functions. No Azure, no Supabase Edge Functions. Vercel Teams with Fluid Compute gives us 800s timeout — more than enough for the full pipeline (~90s with Whisper, ~30s without).

---

## GHL Credentials (Already Configured)

| Item | Value |
|---|---|
| App name | AskMosesInt (API v2.0) |
| Location ID | `l2VVQax2pxKTUZWYYsW0` |
| Access Token | `YOUR_GHL_ACCESS_TOKEN` |
| API Base | `https://services.leadconnectorhq.com/v2` |
| Scopes | conversations, objects/schema, objects/record, medias, templates, tags, redirects, products, **contacts, opportunities, users** (all .readonly) |
| Workflow | "Call Completion Notification" → Send to Ask Moses → Email Check Confirmation |

---

## Webhook Payload (Already Configured in GHL)

These fields are already configured in the "Send to Ask Moses" webhook action:

```json
{
  "type": "callCompleted",
  "contactId": "{{contact.id}}",
  "userId": "{{phoneCall.user.id}}",
  "callStatus": "{{phoneCall.callStatus}}",
  "callDirection": "{{phoneCall.direction}}",
  "transcript": "{{voice_ai.transcript}}",
  "userName": "{{phoneCall.user.name}}",
  "userEmail": "{{user.email}}",
  "contactName": "{{contact.name}}",
  "duration": "{{phoneCall.duration}}",
  "contactSource": "{{contact.source}}",
  "contactEmail": "{{contact.email}}"
}
```

**Note:** `recordingUrl` is NOT available as a workflow variable. The backend fetches it via GHL Conversations API using the `contactId`. **Audio is mandatory** — all transcription is done via OpenAI Whisper. GHL's built-in transcript is not used due to quality issues.

**Important:** The `transcript` field in the webhook payload (`{{voice_ai.transcript}}`) is **ignored**. We always download the audio and run Whisper ourselves for consistent, high-quality transcription.

---

## Step-by-Step Implementation

### STEP 1 — Create the webhook endpoint

**File:** `app/api/webhooks/ghl/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minutes — Vercel Teams allows up to 800s

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role for server-side ops
);

export async function POST(req: NextRequest) {
  // 1. Parse payload
  const payload = await req.json();

  // 2. Validate webhook (check secret header)
  const secret = req.headers.get('X-AskMoses-Secret');
  if (secret !== process.env.GHL_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Check idempotency — has this call been processed?
  // Use a combination of contactId + timestamp as external_call_id
  // (GHL doesn't send a unique callId in custom webhook data)
  const externalId = `${payload.contactId}_${payload.callStatus}_${Date.now()}`;
  // Better: if you find a callId in standard data, use that

  // 4. Save call as "pending" in Supabase
  const { data: call, error } = await supabase
    .from('calls')
    .insert({
      org_id: await resolveOrgId(payload), // map GHL locationId → org
      lead_name: normalizeEmpty(payload.contactName),
      caller_name: normalizeEmpty(payload.userName),
      lead_source: normalizeSource(payload.contactSource),
      call_type: detectCallType(payload.callDirection, payload.contactId),
      duration: parseInt(payload.duration) || null,
      external_call_id: externalId,
      processing_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save call:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  // 5. Return 200 immediately to GHL (prevents timeout/retry)
  // 6. Process in background via waitUntil
  const { waitUntil } = await import('next/server');
  waitUntil(processCallPipeline(call.id, payload));

  return Response.json({ status: 'received', callId: call.id });
}
```

**Environment variables to add in Vercel Dashboard:**
```
GHL_WEBHOOK_SECRET=amws_2026_askmoses_secret  (share with GHL webhook headers)
GHL_ACCESS_TOKEN=pit-d0c072b8-8a73-43cf-982b-a22b457a0d29
GHL_API_BASE=https://services.leadconnectorhq.com/v2
```

**Also add in GHL webhook headers:**
```
X-AskMoses-Secret: amws_2026_askmoses_secret
```

---

### STEP 2 — Helper functions

**File:** `lib/services/ghl-helpers.ts`

```typescript
// Normalize empty strings to null (GHL sends "" for missing fields)
export function normalizeEmpty(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') return null;
  return value.trim();
}

// Normalize lead source — unmapped values become "other"
export function normalizeSource(source: string | null | undefined): string | null {
  if (!source || source.trim() === '') return null;
  const valid = ['facebook', 'google', 'organic', 'referral', 'other'];
  const normalized = source.trim().toLowerCase();
  return valid.includes(normalized) ? normalized : 'other';
}

// Detect call type from GHL direction
export function detectCallType(
  direction: string | null,
  contactId: string | null
): string {
  if (!direction) return 'unknown';
  if (direction === 'inbound') {
    // TODO: check if contactId has prior calls → warm_inbound vs cold_inbound
    // For now, default to cold_inbound for inbound calls
    return 'cold_inbound';
  }
  return 'scheduled_followup'; // outbound = scheduled
}

// Map GHL locationId to AskMoses org_id
export async function resolveOrgId(payload: any): Promise<string> {
  // For now: single org mapping
  // TODO: when multi-tenant, lookup org by GHL locationId
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('ghl_location_id', payload.locationId || 'l2VVQax2pxKTUZWYYsW0')
    .single();
  return data?.id || process.env.DEFAULT_ORG_ID!;
}
```

---

### STEP 3 — Background pipeline

**File:** `lib/services/call-pipeline.ts`

This is the core. Runs in background via `waitUntil()`. Has up to 800s on Vercel Teams.

```typescript
export async function processCallPipeline(callId: string, payload: any) {
  try {
    // Update status
    await updateCallStatus(callId, 'processing');

    // ── STEP A: Get audio and transcribe via Whisper ──
    // GHL transcript is NOT used (quality too low). Always Whisper.
    const audioResult = await fetchAndStoreRecording(payload.contactId, callId, orgId);
    
    if (!audioResult) {
      // No audio found in GHL → pipeline stops. Cannot score without transcript.
      await updateCallStatus(callId, 'no_recording');
      return;
    }

    // Save recording URL
    await supabase
      .from('calls')
      .update({ recording_url: audioResult.blobUrl })
      .eq('id', callId);

    // Transcribe via Whisper
    const transcript = await transcribeWithWhisper(audioResult.blobUrl);
    
    if (!transcript) {
      await updateCallStatus(callId, 'transcription_failed');
      return;
    }

    // Save transcript
    await supabase
      .from('calls')
      .update({ transcript, transcript_source: 'whisper' })
      .eq('id', callId);

    // ── STEP B: Detect call type from transcript ──
    const callClassification = await classifyCall(transcript);
    // Returns: 'sales_call' | 'non_sales' | 'rescheduling' | 'support'

    if (callClassification === 'non_sales' || callClassification === 'support') {
      // Skip scoring for non-sales calls
      await supabase
        .from('calls')
        .update({
          call_subtype: callClassification,
          processing_status: 'completed_no_score',
        })
        .eq('id', callId);
      return;
    }

    // ── STEP C: Score against rubric ──
    const orgId = await getCallOrgId(callId);
    const rubric = await getDefaultRubric(orgId);

    if (!rubric) {
      await updateCallStatus(callId, 'no_rubric');
      return;
    }

    // Assemble dynamic prompt from rubric
    const prompt = assemblePrompt(rubric, transcript);

    // Call LLM (model from rubric.llm_model or default)
    const aiResponse = await callLLM(prompt, rubric.llm_model || 'gpt-4o-mini');

    // Validate response — strip sections not in rubric
    const validatedSections = validateSections(aiResponse.sections, rubric.sections);

    // Calculate overall score (weighted average)
    const overallScore = calculateOverallScore(validatedSections, rubric.sections);

    // ── STEP D: Save results ──
    await supabase
      .from('calls')
      .update({
        sections_json: validatedSections,
        overall_score: overallScore,
        suggested_outcome: aiResponse.suggested_outcome || null,
        summary: aiResponse.summary,
        strengths: aiResponse.strengths,
        improvements: aiResponse.improvements,
        call_subtype: callClassification,
        processing_status: 'completed',
      })
      .eq('id', callId);

    // ── STEP E: Generate coaching email ──
    await generateCoachingEmail(callId, rubric);

  } catch (error) {
    console.error(`Pipeline failed for call ${callId}:`, error);
    await updateCallStatus(callId, 'analysis_failed');
  }
}
```

---

### STEP 4 — Fetch recording URL via GHL API (if needed)

**File:** `lib/services/ghl-api.ts`

Only called when `payload.transcript` is empty — we need the audio.

```typescript
const GHL_API = process.env.GHL_API_BASE!;
const GHL_TOKEN = process.env.GHL_ACCESS_TOKEN!;

export async function fetchRecordingUrl(contactId: string): Promise<string | null> {
  try {
    // Search conversations for this contact to find the call recording
    const res = await fetch(
      `${GHL_API}/conversations/search?contactId=${contactId}`,
      {
        headers: {
          'Authorization': `Bearer ${GHL_TOKEN}`,
          'Version': '2021-04-15',
        },
      }
    );
    const data = await res.json();

    // Find the most recent call message with a recording
    const conversations = data.conversations || [];
    for (const conv of conversations) {
      const messagesRes = await fetch(
        `${GHL_API}/conversations/${conv.id}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${GHL_TOKEN}`,
            'Version': '2021-04-15',
          },
        }
      );
      const messagesData = await messagesRes.json();
      const callMessage = messagesData.messages?.find(
        (m: any) => m.type === 'CALL' && m.attachments?.length > 0
      );
      if (callMessage) {
        return callMessage.attachments[0]?.url || null;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch recording URL:', error);
    return null;
  }
}
```

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

| Variable | Value | Environments |
|---|---|---|
| `GHL_WEBHOOK_SECRET` | `amws_2026_askmoses_secret` | Production, Preview |
| `GHL_ACCESS_TOKEN` | `pit-d0c072b8-8a73-43cf-982b-a22b457a0d29` | Production, Preview |
| `GHL_API_BASE` | `https://services.leadconnectorhq.com/v2` | Production, Preview |
| `DEFAULT_ORG_ID` | (UUID of the default org in Supabase) | Production, Preview |

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

## Pipeline Timing (Expected)

| Step | Time |
|---|---|
| Receive + validate + save | <1s |
| Return 200 to GHL | <1s |
| Fetch recording via GHL API | 2-5s |
| Download audio to Vercel Blob | 5-15s |
| Whisper transcription (30 min call) | 60-90s |
| Detect call type | 2-5s |
| LLM scoring | 10-30s |
| Calculate + save | <1s |
| Generate email | 2-5s |
| **Total** | **~85-155s** |

Well within the 300s default / 800s max of Vercel Teams with Fluid Compute.

---

## Cost Per Call

| Component | Cost |
|---|---|
| Whisper transcription (30 min) | ~$0.18 |
| LLM scoring | ~$0.02 |
| Vercel compute (~120s) | ~$0.003 |
| Vercel Blob storage | ~$0.0003 |
| **Total per call** | **~$0.20** |
| **At 500 calls/month** | **~$100/mo** |

All transcription runs through OpenAI Whisper. GHL transcript is not used.

---

## File Structure Summary

```
app/
  api/
    webhooks/
      ghl/
        route.ts          ← STEP 1: Webhook endpoint
lib/
  services/
    ghl-helpers.ts        ← STEP 2: Normalize, detect, resolve
    ghl-api.ts            ← STEP 4: Fetch recording URL
    call-pipeline.ts      ← STEP 3: Background processing pipeline
    scoring.ts            ← Existing: calculateOverallScore
    prompt-assembler.ts   ← Existing: assemblePrompt from rubric
    coaching-email.ts     ← Existing: generateCoachingEmail
scripts/
  ghl_integration.sql     ← STEP 5: Schema migration
```

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
