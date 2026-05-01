-- Migration: 001_section_scores
-- Purpose: Extend calls.criteria JSONB to support grouped sections with per-section scores,
--          feedback, and a critical flag. Replaces the flat criteria[] array format.
--
-- Before: criteria JSONB stored as CriterionScore[]
--   [{ criterionId, criterionName, score (0-5), justification }]
--
-- After: sections JSONB stored as CallSection[]
--   [{ name, score (0-10), feedback, critical }]
--   overallScore = weighted average of section scores * 10, capped by outcome
--
-- Backward compatibility: criteria column is preserved as-is.
--   Old calls without sections[] simply render the flat rubricScores view.
--   New calls include both criteria[] (raw AI output) and sections[] (structured).

-- 1. Add sections column (nullable — old calls won't have it)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL;

-- 2. Backfill: convert existing criteria[] into sections[]
--    Maps the 5 default criterion names to the section format.
--    Score is converted from 0-5 to 0-10 (score * 2).
UPDATE calls
SET sections = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name',     elem->>'criterionName',
      'score',    ((elem->>'score')::numeric * 2),
      'feedback', elem->>'justification',
      'critical', CASE
                    WHEN elem->>'criterionName' IN ('Discovery', 'Problem Agitation')
                    THEN true
                    ELSE false
                  END
    )
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(criteria) WITH ORDINALITY AS t(elem, ordinality)
)
WHERE criteria IS NOT NULL
  AND jsonb_typeof(criteria) = 'array'
  AND jsonb_array_length(criteria) > 0
  AND sections IS NULL;

-- 3. Index for efficient filtering on critical sections
CREATE INDEX IF NOT EXISTS idx_calls_sections
  ON calls USING GIN (sections);

-- Rollback (run manually if needed):
-- ALTER TABLE calls DROP COLUMN IF EXISTS sections;
-- DROP INDEX IF EXISTS idx_calls_sections;
