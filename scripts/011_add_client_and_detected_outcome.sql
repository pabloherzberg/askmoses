-- Add client_name column to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Add detected_outcome column (what the AI detected from the transcript)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS detected_outcome TEXT 
  CHECK (detected_outcome IN ('closed', 'follow_up', 'objection_unresolved', 'no_decision'));

-- Create index for client name search
CREATE INDEX IF NOT EXISTS calls_client_name_idx ON public.calls(client_name);
