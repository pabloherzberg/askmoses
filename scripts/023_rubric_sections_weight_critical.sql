-- Add weight and is_critical columns to criteria table
-- weight: integer (0–100), sum across rubric must equal 100
-- is_critical: boolean — score ≤ 4 on a critical section triggers red alert in email

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;

-- Seed weights and critical flags for the default rubric criteria
UPDATE public.criteria
SET weight = 20, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Discovery';

UPDATE public.criteria
SET weight = 25, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Problem Agitation';

UPDATE public.criteria
SET weight = 20, is_critical = false
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Offer Presentation';

UPDATE public.criteria
SET weight = 25, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Objection Handling';

UPDATE public.criteria
SET weight = 10, is_critical = false
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Close & Next Steps';
