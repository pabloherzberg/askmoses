-- Drop analysis_mode column from rubrics table (no longer needed)
ALTER TABLE rubrics DROP COLUMN IF EXISTS analysis_mode;

-- Drop analysis_mode column from calls table (no longer needed)
ALTER TABLE calls DROP COLUMN IF EXISTS analysis_mode;
