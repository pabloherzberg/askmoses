-- Add criteria column to scripts table
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS criteria JSONB DEFAULT '[]'::jsonb;

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_scripts_criteria ON scripts USING GIN(criteria);
