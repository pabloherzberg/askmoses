-- Migration 035: Drop legacy criteria columns from calls table
--
-- Background: Task 1.1 introduced the `sections` column (array of
-- {name, score, feedback, critical, weight}) as the canonical format.
-- The `criteria` and `total_criteria` columns duplicated the same data
-- in the old format (without the `critical` flag). All application code
-- has been migrated to read/write `sections` only.
--
-- Run once on every environment (dev, staging, prod) after deploying
-- the application code that removes all `criteria` reads and writes.

ALTER TABLE calls
  DROP COLUMN IF EXISTS criteria,
  DROP COLUMN IF EXISTS total_criteria;
