# AskMoses.AI — Database Schema Reference

> **Audience:** Data scientists, ML engineers, backend developers.
> **Last updated:** 2026-05-08
> **Migration applied:** `scripts/036_ml_fields.sql`

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
| `overall_score` | NUMERIC(3,1) | NO | 0.0–5.0 weighted average of section scores |
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
| `closed` | Deal closed on this call |
| `not_closed` | Call completed, no deal |
| `partial` | Follow-up scheduled / co-decision maker involved |
| `no_outcome` | Call ended with no resolution |

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

## Indexes relevant to ML queries

| Index | Table | Columns |
|---|---|---|
| `calls_closed_idx` | calls | `closed` |
| `calls_closed_org_idx` | calls | `org_id, closed` |
| `calls_call_date_idx` | calls | `call_date DESC` |
| `calls_trainer_id_idx` | calls | `trainer_id` |
| `calls_org_id_idx` | calls | `org_id` |
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
