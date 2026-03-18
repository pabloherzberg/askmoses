-- Create rubrics table for storing scoring criteria
CREATE TABLE IF NOT EXISTS public.rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create criteria table for individual scoring criteria within a rubric
CREATE TABLE IF NOT EXISTS public.criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id UUID NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria ENABLE ROW LEVEL SECURITY;

-- For MVP without auth, allow all operations (will add user_id later)
CREATE POLICY "Allow all rubrics operations" ON public.rubrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all criteria operations" ON public.criteria FOR ALL USING (true) WITH CHECK (true);

-- Insert default rubric with 5 criteria
INSERT INTO public.rubrics (id, name, description, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Sales Call Rubric',
  'Default rubric for evaluating dog trainer sales calls',
  true
);

INSERT INTO public.criteria (rubric_id, name, description, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Greeting & Introduction', 'Did the trainer properly greet the prospect and introduce themselves?', 1),
  ('00000000-0000-0000-0000-000000000001', 'Discovery Questions', 'Did the trainer ask relevant questions to understand needs?', 2),
  ('00000000-0000-0000-0000-000000000001', 'Value Proposition', 'Did the trainer clearly communicate the value and benefits?', 3),
  ('00000000-0000-0000-0000-000000000001', 'Objection Handling', 'Did the trainer effectively address objections?', 4),
  ('00000000-0000-0000-0000-000000000001', 'Call to Action', 'Did the trainer end with a clear next step?', 5);
