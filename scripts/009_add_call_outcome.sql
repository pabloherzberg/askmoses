ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_outcome TEXT DEFAULT 'not_closed' CHECK (call_outcome IN ('closed', 'not_closed', 'partial'));
