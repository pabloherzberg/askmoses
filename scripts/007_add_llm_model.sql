-- Add llm_model column to rubrics table
ALTER TABLE rubrics
ADD COLUMN IF NOT EXISTS llm_model VARCHAR(50) DEFAULT 'openai/gpt-4o-mini';
