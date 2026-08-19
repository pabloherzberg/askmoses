# AskMoses.AI — Database Schema Reference

> **Audience:** Data scientists, ML engineers, backend developers.
> **Last updated:** 2026-08-19
> **Latest migration documented here:** `scripts/107_won_rate_and_weekly_stats.sql`
>
> This file is written by hand and can drift from the live database. Migration history below lists what the repo's scripts create — constraints applied directly to a database will not appear. `scripts/schema-fingerprint.sql` compares two databases when they disagree.

---

## Quick reference — ML pipeline fields

For the correlation model between coaching dimensions and close rate, use the view:

```sql
SELECT * FROM public.calls_ml_flat
WHERE org_id = '<org_id>'
  AND call_date >= '2025-01-01';
```

This view exposes one row per call with scalar columns for each rubric dimension — no JSON parsing needed.

---

## Tables

### `organizations`

Tenant root. Every other entity is scoped by `org_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Company name |
| `avg_ticket` | NUMERIC | Average deal size (used for ROI calc) |
| `client_id` | UUID FK → `clients.id` | Reverse 1:1 link to billing entity |
| `created_at` | TIMESTAMPTZ | |

---

### `profiles`

One row per authenticated user. Mirrors `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK → `auth.users.id` | |
| `role` | TEXT | `trainer` \| `owner` \| `admin` |
| `owner_id` | UUID | FK → `owners.id` (set for trainers) |
| `name` | TEXT | Display name |
| `avatar` | TEXT | URL |
| `org_id` | UUID FK → `organizations.id` | |
| `created_at` | TIMESTAMPTZ | |

**Trigger:** `on_profile_upserted` writes `role` into `auth.users.raw_app_meta_data` so the JWT carries the claim.

---

### `rubrics`

Scoring rubric template per org.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `is_active` | BOOLEAN | Only one active rubric per org used for scoring |
| `analysis_mode` | TEXT | `criteria` \| `script` |
| `org_id` | UUID FK → `organizations.id` | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `criteria`

Individual scoring dimensions within a rubric. These are the coaching dimensions evaluated per call.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `rubric_id` | UUID FK → `rubrics.id` | |
| `name` | TEXT | Dimension name (e.g. "Discovery", "Close & Next Steps") |
| `description` | TEXT | What to evaluate |
| `sort_order` | INT | Display order |
| `weight` | INT | 0–100, sum across rubric = 100 |
| `is_critical` | BOOLEAN | Score ≤ 4 on critical → red alert in coaching email |
| `org_id` | UUID FK → `organizations.id` | |
| `created_at` | TIMESTAMPTZ | |

**ML relevance:** `weight` and `is_critical` are features for the coaching impact model. A low score on a `is_critical=true` dimension is a stronger signal than a low score on a non-critical one.

---

### `calls`

Core table. One row per analyzed call. **Primary source for the ML pipeline.**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | NO | |
| `rubric_id` | UUID FK → `rubrics.id` | NO | Rubric used at analysis time |
| `trainer_id` | UUID FK → `trainers.id` | YES | NULL for legacy rows |
| `trainer_name` | TEXT | NO | Denormalized for display |
| `trainer_email` | TEXT | NO | Denormalized for email routing |
| `org_id` | UUID FK → `organizations.id` | YES | |
| `transcript` | TEXT | NO | Raw transcript |
| `overall_score` | NUMERIC(4,1) | NO | **0–100** weighted average of section scores. Widened and rescaled from 0.0–5.0 by migration 043 — the 0–5 you see in the UI is display only, produced by `toDisplay5()` (`s / 20`). Do not divide by 20 outside `lib/score-display.ts`. |
| `summary` | TEXT | NO | AI-generated summary |
| `strengths` | TEXT[] | NO | Array of strength observations |
| `improvements` | TEXT[] | NO | Array of improvement suggestions |
| `sections` | JSONB | YES | Array of `{name, score, feedback, critical, weight}` — see below |
| `call_outcome` | call_outcome_enum | YES | User-confirmed outcome |
| `detected_outcome` | call_outcome_enum | YES | AI-detected outcome |
| **`closed`** | **BOOLEAN** | **YES** | **Derived from `call_outcome = 'closed'`. Auto-synced via trigger. Primary binary label for ML.** |
| `client_name` | TEXT | YES | Prospect name |
| **`call_date`** | **DATE** | **YES** | **Date the call occurred (≠ upload date). Backfilled from `created_at` for legacy rows.** |
| **`duration_seconds`** | **INT** | **YES** | **Call duration. NULL for legacy rows (not available).** |
| `email_sent` | BOOLEAN | YES | Coaching email was dispatched |
| `email_id` | TEXT | YES | Resend message ID |
| `model_used` | TEXT | YES | LLM model (e.g. `gpt-4o-mini`) |
| `input_tokens` | INT | YES | |
| `output_tokens` | INT | YES | |
| `cost_usd` | NUMERIC(10,6) | YES | |
| `prompt_version` | TEXT | YES | `v1` for legacy, `v2` for prompt redesign |
| `created_at` | TIMESTAMPTZ | NO | Upload timestamp |
| `updated_at` | TIMESTAMPTZ | NO | |

**Bold = added in migration 036 for ML pipeline.**

#### `call_outcome_enum` values

| Value | Meaning |
|---|---|
| `closed` | Deal closed, or advanced partially (follow-up scheduled, co-decision maker involved) — the call moved something forward |
| `not_closed` | Call completed with no deal, or ended with no clear resolution |

Simplified from 4 to 2 values in migration 105 (`partial` → `closed`, `no_outcome` → `not_closed`).

#### `sections` JSONB structure

```jsonc
[
  {
    "name": "Discovery",        // Dimension name (matches criteria.name)
    "score": 4.1,               // 0.0–5.0
    "feedback": "...",          // AI-generated per-dimension feedback
    "critical": true,           // Mirrors criteria.is_critical at analysis time
    "weight": 20                // Mirrors criteria.weight at analysis time
  },
  // ... one entry per rubric criterion
]
```

---

### `scripts`

Sales script templates (used in `analysis_mode = 'script'`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `rubric_id` | UUID FK → `rubrics.id` | |
| `name` | TEXT | |
| `description` | TEXT | |
| `sections` | JSONB | Array of `{name, instructions, tips}` |
| `full_script` | TEXT | Complete script text |
| `is_active` | BOOLEAN | |
| `org_id` | UUID FK → `organizations.id` | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `insights` *(MSW only — Phase 1)*

Not a real Supabase table in Phase 1. Insights are generated in-memory by the MSW handler at `POST /api/insights`. Schema is defined in `lib/types.ts` (`Insight` type) and mock data lives in `lib/mocks/data/insights-analysis.ts`.

---

## View: `calls_ml_flat`

Flat projection of `calls` with JSONB `sections` expanded into scalar columns. Use this for ML instead of parsing JSONB in Python.

```sql
SELECT
  id, org_id, trainer_id, trainer_name,
  call_date, uploaded_at, duration_seconds,
  overall_score,
  closed,                   -- Boolean label for classification model
  call_outcome,             -- Multi-class label
  detected_outcome,         -- AI prediction (feature or comparison target)
  model_used, prompt_version, cost_usd,
  score_discovery,
  score_problem_agitation,
  score_offer_presentation,
  score_objection_handling,
  score_close_next_steps
FROM public.calls_ml_flat
WHERE org_id = '<org_id>';
```

**Note:** Rows where `sections IS NULL` (calls analyzed before the section-scoring prompt — `prompt_version = 'v1'`) are excluded from this view.

---

## Trigger: `trg_sync_closed`

Fires `BEFORE INSERT OR UPDATE OF call_outcome` on `calls`. Automatically sets `closed = (call_outcome = 'closed')`. You never need to set `closed` manually.

---

## Trigger: `trg_calls_updated_at`

Fires `BEFORE UPDATE` on `calls` and sets `updated_at = now()`, overriding whatever the application sent. Added in migration 107.

The weekly stamp into `call_stats_weekly` is incremental — it finds the weeks that need recomputing with `WHERE calls.updated_at >= <last run>`. That only holds if `updated_at` moves on every write. With the trigger, forgetting to set it stops being possible; without it, a new write path that omits it makes the call invisible to the stamp, and the failure is silent.

Coexists with `trg_sync_closed`: both are `BEFORE ... FOR EACH ROW` and touch different columns, so their order does not matter. Paired with `calls_updated_at_idx` so the lookup does not scan the table.

A bulk `UPDATE` (a backfill, a data fix) moves `updated_at` on every row it touches, and the next stamp will recompute every week involved. That is correct — the data did change — but it is one expensive run.

---

## Table: `call_stats_weekly`

Weekly aggregates per org and per sales person. **Append-only** — counts only, no transcript, no prospect name, no `contact_id`. Nothing here identifies a person, which is why a churned client's rows stay.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | NO | |
| `org_id` | UUID FK → `organizations.id` | NO | `ON DELETE RESTRICT` — deleting an org must not take its history |
| `trainer_id` | UUID FK → `trainers.id` | YES | **NULL = the org row**, same convention as `org_won_rate` |
| `week_start` | DATE | NO | Monday |
| `snapshot_at` | DATE | NO | Day the row was stamped — part of the grain |
| `total_calls` | INT | NO | Calls made that week |
| `closed_calls` | INT | NO | Of those, how many booked an evaluation |
| `closed_leads` | INT | NO | Distinct leads that booked that week |
| `won_leads` | INT | NO | Of **those** leads, how many had bought as of `snapshot_at` |
| `score_sum` | NUMERIC(12,2) | NO | Sum of `overall_score`, **0–100 scale** — same as the source column. Not 0–5; that is display only |
| `score_count` | INT | NO | Calls that had a score. **Not** `total_calls` — an unscored call must not drag the mean toward zero |
| `intent_sum` | NUMERIC(12,2) | NO | Sum of `intent` (0–5) |
| `intent_count` | INT | NO | Calls that had an intent |
| `avg_score` | NUMERIC | YES | `GENERATED` — `score_sum / score_count`. Convenience only; the sums are the fact |
| `avg_intent` | NUMERIC | YES | `GENERATED` — `intent_sum / intent_count` |
| `source` | TEXT | NO | `live` \| `backfill` |
| `created_at` | TIMESTAMPTZ | NO | |

**Facts, never results.** This is a log for statistical analysis, not a render cache, so it stores only what is additive — counts and sums — and nothing already divided. Every division happens on read:

```
close rate = closed_calls / total_calls    (per call)
won rate   = won_leads    / closed_leads   (per lead)
avg score  = score_sum    / score_count
```

This applies to means for the same reason it applies to rates: both throw away the denominator. **An average of averages is wrong whenever the Ns differ** — a 3-call week averaging 80 and a 30-call week averaging 60 combine to 61.8, not 70. Keeping what is additive means any regrouping works: weeks into a month, sales people into a team, org by period. None of that is recoverable from a number that has already been divided.

The three denominators differ on purpose. A call with no `contact_id` counts in `total_calls` and not in `closed_leads`; a call with no score counts in `total_calls` and not in `score_count`. Each metric counts the population it is actually about.

**Why `snapshot_at` is in the grain.** `won_leads` matures: a lead that books this week may buy a month from now. Each stamp records "of week X's bookings, this many had sold by then". Re-stamping does not correct the past — it adds a riper reading beside it, and the earlier one stays for audit. Read the current figure with:

```sql
SELECT DISTINCT ON (trainer_id, week_start) *
FROM   public.call_stats_weekly
WHERE  org_id = $1
ORDER  BY trainer_id, week_start DESC, snapshot_at DESC;
```

**Write contract:** `stamp_call_stats_weekly()` inserts a row only when a measured value actually changed against the most recent snapshot for that (org, sales person, week). A week that has stopped moving stops producing rows, so every row that exists represents a real change — the table is a log of changes, not a log of cron runs.

It also decides *which* weeks to recompute rather than sweeping a fixed window: dirty weeks come from `calls.updated_at` since the cursor in `job_watermarks`, expanded from the changed call to its lead and then to every week that lead booked in. That expansion matters because a sale changes `ghl_won_status`, while the week that needs recomputing is the booking week. Driven weekly by `GET /api/cron/snapshot-weekly`.

**Attribution:** the week is the week of the *booking*, not of the sale. The org row is not the sum of the sales-person rows — a lead worked by two people counts once for each and once for the org.

`UPDATE` and `DELETE` are revoked from `anon`, `authenticated` and `service_role`. Correcting a figure means inserting a new `snapshot_at`.

---

## Function: `org_won_rate(p_org_id uuid)`

Returns the numerator and denominator behind **Won Rate**, one row per sales person plus one row with `trainer_id IS NULL` for the whole org.

| Column | Meaning |
|---|---|
| `trainer_id` | Sales person, or `NULL` for the org total |
| `closed_leads` | Distinct `contact_id` with at least one call where `call_outcome = 'closed'` |
| `won_leads` | Those same leads that also have a call with `ghl_won_status = 'won'` |

Won Rate = `won_leads / closed_leads`. Two rules matter when reading this:

- **Counted per lead, never per call.** `dbUpdateGhlOpportunity` stamps `ghl_won_status` on *every* call belonging to a contact, so counting calls would turn one sale into six and push the rate past 100%. `COUNT(DISTINCT contact_id)` is immune to that.
- **The org row is not the sum of the sales-person rows.** A lead worked by two people counts once for each of them and once for the org.

Calls with `contact_id IS NULL` (manual upload, GHL calls predating backfill 102) are excluded from both sides — which is why this denominator is smaller than the one behind Close Rate, which counts calls.

Global and not restricted to any period, matching `dbGetOrgCloseRate`.

---

## Indexes relevant to ML queries

| Index | Table | Columns |
|---|---|---|
| `calls_closed_idx` | calls | `closed` |
| `calls_closed_org_idx` | calls | `org_id, closed` |
| `calls_call_date_idx` | calls | `call_date DESC` |
| `calls_trainer_id_idx` | calls | `trainer_id` |
| `calls_org_id_idx` | calls | `org_id` |
| `calls_updated_at_idx` | calls | `updated_at` |
| `idx_calls_sections` | calls | `sections` (GIN) |

---

## ML pipeline — recommended query

```sql
-- Pull all calls for correlation analysis
SELECT
  f.*,
  t.name    AS trainer_full_name,
  o.name    AS org_name,
  o.avg_ticket
FROM public.calls_ml_flat f
JOIN public.trainers t  ON t.id = f.trainer_id
JOIN public.organizations o ON o.id = f.org_id
WHERE f.closed IS NOT NULL         -- exclude rows with unset outcome
  AND f.score_discovery IS NOT NULL -- exclude legacy v1 calls without sections
ORDER BY f.call_date DESC;
```

**Features for the model:**
- `score_discovery`, `score_problem_agitation`, `score_offer_presentation`, `score_objection_handling`, `score_close_next_steps`
- `overall_score`
- `duration_seconds` (when available)
- `detected_outcome` (AI confidence signal)

**Label:** `closed` (boolean)

---

## Migration history (schema-relevant)

| File | What changed |
|---|---|
| `001_create_rubrics.sql` | Creates `rubrics`, `criteria` |
| `003_create_calls_table.sql` | Creates `calls` (base) |
| `004_create_scripts_table.sql` | Creates `scripts` |
| `009_add_call_outcome.sql` | Adds `call_outcome TEXT` |
| `011_add_client_and_detected_outcome.sql` | Adds `client_name`, `detected_outcome` |
| `012_create_organizations.sql` | Creates `organizations`, adds `org_id` to all tables |
| `create-profiles-table.sql` | Creates `profiles` |
| `021_fix_schema_gaps.sql` | Adds `trainer_id` to calls, creates `owners` table |
| `022_call_outcome_enum.sql` | Converts TEXT → `call_outcome_enum` |
| `023_rubric_sections_weight_critical.sql` | Adds `weight`, `is_critical` to `criteria` |
| `024_call_cost_tracking.sql` | Adds `model_used`, tokens, `cost_usd`, `prompt_version` |
| `025_ensure_sections_column.sql` | Adds `sections JSONB` to `calls` |
| `033_overall_score_numeric.sql` | Converts `overall_score INT → NUMERIC(3,1)` |
| `035_drop_criteria_columns.sql` | Drops legacy `criteria`, `total_criteria` columns |
| **`036_ml_fields.sql`** | **Adds `closed`, `call_date`, `duration_seconds`; creates `calls_ml_flat` view and `trg_sync_closed` trigger** |
| `105_call_outcome_2_values.sql` | Simplifies `call_outcome_enum` from 4 to 2 values (`partial`→`closed`, `no_outcome`→`not_closed`); remaps `organizations.stage1_success_outcomes` |
| `107_won_rate_and_weekly_stats.sql` | Won Rate and the weekly stats log: `org_won_rate(uuid)`, `call_stats_weekly` (append-only), `job_watermarks`, `stamp_call_stats_weekly()`, `calls_updated_at_idx` + `trg_calls_updated_at`, and the one-time backfill |
