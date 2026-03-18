-- Update call_outcome column to support 4 categorical outcomes
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_call_outcome_check;

ALTER TABLE calls ADD CONSTRAINT calls_call_outcome_check 
  CHECK (call_outcome IN ('closed', 'follow_up', 'objection_unresolved', 'no_decision', 'not_closed', 'partial'));
