-- Update all calls to have today's date (February 4, 2026)
UPDATE calls 
SET created_at = '2026-02-04'::timestamp + (random() * interval '12 hours');
