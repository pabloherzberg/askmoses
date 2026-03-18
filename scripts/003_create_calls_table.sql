-- Create calls table to store all processed calls
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id UUID NOT NULL REFERENCES rubrics(id),
  trainer_name TEXT NOT NULL,
  trainer_email TEXT NOT NULL,
  transcript TEXT NOT NULL,
  overall_score INT NOT NULL,
  total_criteria INT NOT NULL,
  criteria JSONB NOT NULL,
  summary TEXT NOT NULL,
  strengths TEXT[] NOT NULL,
  improvements TEXT[] NOT NULL,
  email_sent BOOLEAN DEFAULT FALSE,
  email_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read calls (admin view)
CREATE POLICY "Allow read calls" ON public.calls FOR SELECT USING (true);

-- Allow inserts to save calls
CREATE POLICY "Allow insert calls" ON public.calls FOR INSERT WITH CHECK (true);

-- Allow updates to modify calls (for resend email)
CREATE POLICY "Allow update calls" ON public.calls FOR UPDATE USING (true);

-- Create index for faster queries
CREATE INDEX calls_created_at_idx ON public.calls(created_at DESC);
CREATE INDEX calls_trainer_name_idx ON public.calls(trainer_name);
CREATE INDEX calls_rubric_id_idx ON public.calls(rubric_id);
