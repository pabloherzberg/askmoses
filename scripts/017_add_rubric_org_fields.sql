-- Migration: Add org fields and personalisation columns to rubrics (DM-04, RB-16–RB-20)
-- Depends on: organizations table (TASK-F2-001)

-- 1. New columns
-- NOTE: org_id FK to organizations added later in 013_create_organizations.sql
ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS org_id UUID,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role_label TEXT NOT NULL DEFAULT 'trainer',
  ADD COLUMN IF NOT EXISTS call_goal TEXT NOT NULL DEFAULT 'close deal',
  ADD COLUMN IF NOT EXISTS coaching_boundaries TEXT,
  ADD COLUMN IF NOT EXISTS coaching_tone TEXT NOT NULL DEFAULT 'encouraging'
    CHECK (coaching_tone IN ('encouraging', 'direct', 'balanced')),
  ADD COLUMN IF NOT EXISTS outcome_options JSONB NOT NULL
    DEFAULT '["closed", "not_closed", "partial", "no_outcome"]'::jsonb;

-- 2. Unique partial index: only one default rubric per org (RB-06)
CREATE UNIQUE INDEX IF NOT EXISTS rubrics_one_default_per_org
  ON public.rubrics (org_id)
  WHERE is_default = true;

-- 3. Backfill demo data — patch the seeded rubric
UPDATE public.rubrics
SET
  is_default          = true,
  role_label          = 'trainer',
  call_goal           = 'close deal',
  coaching_tone       = 'encouraging',
  outcome_options     = '["closed", "not_closed", "partial", "no_outcome"]'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000001';
