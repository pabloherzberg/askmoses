-- Add system_prompt column to rubrics table
ALTER TABLE rubrics ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT 'You are an expert sales coaching AI. Analyze the sales call transcript and provide constructive, actionable feedback based on the provided criteria.';

-- Update the default rubric with a comprehensive system prompt
UPDATE rubrics 
SET system_prompt = 'You are an expert sales coach specializing in dog training business sales. Your role is to analyze sales call transcripts and provide constructive, motivational feedback based on specific evaluation criteria. Be encouraging while pointing out areas for improvement. Focus on practical, actionable tips the trainer can implement immediately.' 
WHERE is_active = true;
