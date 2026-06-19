-- Migration 086: Store intent weights snapshot in calls table
-- Stores the weights used at the time of analysis so historical calls preserve their calculation
-- Added 2026-06-18

ALTER TABLE public.calls
ADD COLUMN intent_weights JSONB DEFAULT NULL;

COMMENT ON COLUMN public.calls.intent_weights IS
'Snapshot of intent weights (financial, urgency, authority, engagement) used during analysis.
Stored as JSONB {financial: 4, urgency: 3, authority: 2, engagement: 1}.
NULL for calls analyzed before this migration.';

-- Add RLS for intent_weights (same as calls table)
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Existing RLS policies already cover this column since it''s just a new column on calls table
