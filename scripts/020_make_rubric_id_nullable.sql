-- Make rubric_id nullable on calls table.
-- Calls uploaded without a configured rubric should still be saved.
ALTER TABLE public.calls
  ALTER COLUMN rubric_id DROP NOT NULL;
