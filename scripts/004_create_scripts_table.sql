-- Create scripts table for sales process templates
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  tips TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_scripts_rubric_id ON scripts(rubric_id);
CREATE INDEX idx_scripts_is_active ON scripts(is_active);

-- Add analysis_mode to rubrics table (criteria vs scripts)
ALTER TABLE rubrics ADD COLUMN IF NOT EXISTS analysis_mode TEXT DEFAULT 'criteria';

-- Sample data
INSERT INTO scripts (rubric_id, name, description, sections, is_active)
SELECT 
  id,
  'Dog Training Sales Process',
  'Standard 5-step sales process for dog training consultations',
  jsonb_build_array(
    jsonb_build_object('name', 'Greeting & Introduction', 'instructions', 'Greet prospect warmly and introduce yourself', 'tips', 'Use their name, establish rapport'),
    jsonb_build_object('name', 'Discovery Questions', 'instructions', 'Ask about their dog and training needs', 'tips', 'Listen more than talk, take notes'),
    jsonb_build_object('name', 'Show Demo', 'instructions', 'Demonstrate training techniques', 'tips', 'Use real dog if possible, explain benefits'),
    jsonb_build_object('name', 'Address Objections', 'instructions', 'Handle concerns about cost/time/results', 'tips', 'Acknowledge concerns, provide social proof'),
    jsonb_build_object('name', 'Call to Action', 'instructions', 'Ask for commitment to next step', 'tips', 'Make it easy to say yes, offer options')
  ),
  TRUE
FROM rubrics
WHERE is_active = TRUE
LIMIT 1;
