-- AskMoses.AI — Profiles table + RLS + trigger

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('trainer', 'owner', 'admin')),
  owner_id   UUID,
  name       TEXT,
  avatar     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_own' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_service_role_all' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_service_role_all ON public.profiles USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_role_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_upserted ON public.profiles;
CREATE TRIGGER on_profile_upserted
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_role_claim();

-- BEGIN: 001_create_rubrics.sql
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


-- BEGIN: 002_add_system_prompt.sql
-- Add system_prompt column to rubrics table
ALTER TABLE rubrics ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT 'You are an expert sales coaching AI. Analyze the sales call transcript and provide constructive, actionable feedback based on the provided criteria.';

-- Update the default rubric with a comprehensive system prompt
UPDATE rubrics 
SET system_prompt = 'You are an expert sales coach specializing in dog training business sales. Your role is to analyze sales call transcripts and provide constructive, motivational feedback based on specific evaluation criteria. Be encouraging while pointing out areas for improvement. Focus on practical, actionable tips the trainer can implement immediately.' 
WHERE is_active = true;


-- BEGIN: 003_create_calls_table.sql
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


-- BEGIN: 004_create_scripts_table.sql
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


-- BEGIN: 005_remove_analysis_mode.sql
-- Drop analysis_mode column from rubrics table (no longer needed)
ALTER TABLE rubrics DROP COLUMN IF EXISTS analysis_mode;

-- Drop analysis_mode column from calls table (no longer needed)
ALTER TABLE calls DROP COLUMN IF EXISTS analysis_mode;


-- BEGIN: 006_add_criteria_to_scripts.sql
-- Add criteria column to scripts table
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS criteria JSONB DEFAULT '[]'::jsonb;

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_scripts_criteria ON scripts USING GIN(criteria);


-- BEGIN: 007_add_llm_model.sql
-- Add llm_model column to rubrics table
ALTER TABLE rubrics
ADD COLUMN IF NOT EXISTS llm_model VARCHAR(50) DEFAULT 'openai/gpt-4o-mini';


-- BEGIN: 008_update_dates_to_today.sql
-- Update all calls to have today's date (February 4, 2026)
UPDATE calls 
SET created_at = '2026-02-04'::timestamp + (random() * interval '12 hours');


-- BEGIN: 009_add_call_outcome.sql
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_outcome TEXT DEFAULT 'not_closed' CHECK (call_outcome IN ('closed', 'not_closed', 'partial'));


-- BEGIN: 010_update_call_outcomes.sql
-- Update call_outcome column to support 4 categorical outcomes
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_call_outcome_check;

ALTER TABLE calls ADD CONSTRAINT calls_call_outcome_check 
  CHECK (call_outcome IN ('closed', 'follow_up', 'objection_unresolved', 'no_decision', 'not_closed', 'partial'));


-- BEGIN: 011_add_client_and_detected_outcome.sql
-- Add client_name column to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Add detected_outcome column (what the AI detected from the transcript)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS detected_outcome TEXT 
  CHECK (detected_outcome IN ('closed', 'follow_up', 'objection_unresolved', 'no_decision'));

-- Create index for client name search
CREATE INDEX IF NOT EXISTS calls_client_name_idx ON public.calls(client_name);


-- BEGIN: 012_create_organizations.sql
-- ============================================================
-- 012_create_organizations.sql
-- Cria tabela organizations e adiciona org_id como FK em
-- profiles, rubrics, criteria, calls e scripts.
-- Configura RLS de isolamento por org em todas as tabelas.
-- ============================================================

-- ─── 1. Tabela organizations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  avg_ticket NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Admin (service_role) acessa tudo; owner acessa apenas a própria org
CREATE POLICY "orgs_service_role_all" ON public.organizations
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 2. Adicionar org_id em profiles ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_org_id_idx ON public.profiles(org_id);

-- ─── 3. Adicionar org_id em rubrics ──────────────────────────────────────────

ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rubrics_org_id_idx ON public.rubrics(org_id);

-- Dropar policy aberta anterior e criar policy de isolamento
DROP POLICY IF EXISTS "Allow all rubrics operations" ON public.rubrics;

CREATE POLICY "rubrics_service_role_all" ON public.rubrics
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "rubrics_isolate_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 4. Adicionar org_id em criteria ─────────────────────────────────────────

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS criteria_org_id_idx ON public.criteria(org_id);

-- Dropar policy aberta anterior e criar policy de isolamento
DROP POLICY IF EXISTS "Allow all criteria operations" ON public.criteria;

CREATE POLICY "criteria_service_role_all" ON public.criteria
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "criteria_isolate_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 5. Adicionar org_id em calls ────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calls_org_id_idx ON public.calls(org_id);

-- Dropar policies abertas anteriores
DROP POLICY IF EXISTS "Allow read calls" ON public.calls;
DROP POLICY IF EXISTS "Allow insert calls" ON public.calls;
DROP POLICY IF EXISTS "Allow update calls" ON public.calls;

CREATE POLICY "calls_service_role_all" ON public.calls
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

-- ─── 6. Adicionar org_id em scripts ──────────────────────────────────────────

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS scripts_org_id_idx ON public.scripts(org_id);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_service_role_all" ON public.scripts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);


ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS trainer_id UUID;
INSERT INTO public.rubrics (id, name, description, is_active, org_id)
VALUES ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Dog Training Sales Rubric', 'Rubric for Dog Wizard HQ', true, NULL)
ON CONFLICT (id) DO NOTHING;


-- BEGIN: 013_seed_demo_org.sql
-- ============================================================
-- 013_seed_demo_org.sql
-- Cria a organização de demo "Dog Wizard HQ" e insere todos
-- os dados mock (users, trainers, rubric, criteria, calls,
-- insights, clients) já vinculados ao org_id.
-- ============================================================

-- ─── IDs fixos para referência cruzada ───────────────────────────────────────

-- org
-- 00000000-0000-0000-0000-000000000100  → Dog Wizard HQ (demo org)

-- users (auth.users são criados via Supabase Auth — estes são da tabela public.users)
-- 00000000-0000-0000-0000-000000000201  → Marcus R.
-- 00000000-0000-0000-0000-000000000202  → Jamie L.
-- 00000000-0000-0000-0000-000000000203  → Jordan K.
-- 00000000-0000-0000-0000-000000000204  → Taylor M.

-- trainers
-- 00000000-0000-0000-0000-000000000301  → Marcus R.
-- 00000000-0000-0000-0000-000000000302  → Jamie L.
-- 00000000-0000-0000-0000-000000000303  → Jordan K.
-- 00000000-0000-0000-0000-000000000304  → Taylor M.

-- rubric
-- b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d  → Dog Training Sales Rubric (já existe em 001_create_rubrics)

-- calls (UUIDs fixos — mapeados do mock)
-- 00000000-0000-0000-0000-000000000601  → call-001 (Marcus / Bob W.)
-- 00000000-0000-0000-0000-000000000602  → call-002 (Marcus / Sarah K.)
-- 00000000-0000-0000-0000-000000000603  → call-003 (Marcus / Mike D.)
-- 00000000-0000-0000-0000-000000000604  → call-004 (Marcus / Linda P.)
-- 00000000-0000-0000-0000-000000000605  → call-005 (Marcus / Tom R.)
-- 00000000-0000-0000-0000-000000000606  → call-006 (Marcus / Amy C.)
-- 00000000-0000-0000-0000-000000000607  → call-007 (Marcus / Chris B.)
-- 00000000-0000-0000-0000-000000000608  → call-008 (Jamie / Diana M.)
-- 00000000-0000-0000-0000-000000000609  → call-009 (Jamie / Robert L.)
-- 00000000-0000-0000-0000-000000000610  → call-010 (Jamie / Karen H.)
-- 00000000-0000-0000-0000-000000000611  → call-011 (Jamie / Steve N.)
-- 00000000-0000-0000-0000-000000000612  → call-012 (Jamie / Nancy W.)
-- 00000000-0000-0000-0000-000000000613  → call-013 (Jordan / Peter G.)
-- 00000000-0000-0000-0000-000000000614  → call-014 (Jordan / Donna F.)
-- 00000000-0000-0000-0000-000000000615  → call-015 (Jordan / Mark T.)
-- 00000000-0000-0000-0000-000000000616  → call-016 (Jordan / Susan B.)
-- 00000000-0000-0000-0000-000000000617  → call-017 (Jordan / James R.)
-- 00000000-0000-0000-0000-000000000618  → call-018 (Taylor / Helen K.)
-- 00000000-0000-0000-0000-000000000619  → call-019 (Taylor / Paul M.)
-- 00000000-0000-0000-0000-000000000620  → call-020 (Taylor / Alice N.)
-- 00000000-0000-0000-0000-000000000621  → call-021 (Taylor / George T.)

-- clients (orgs clientes — visão admin)
-- 00000000-0000-0000-0000-000000000401  → Paw Masters Academy
-- 00000000-0000-0000-0000-000000000402  → Elite K9 Training
-- 00000000-0000-0000-0000-000000000403  → Dog Whisperers Co.

-- ─── 1. Organização de demo ──────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, avg_ticket, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  'Dog Wizard HQ',
  1500,
  '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ─── 2. Users (tabela public.users — perfis dos trainers) ────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  avatar       TEXT,
  avatar_color TEXT DEFAULT 'blue',
  role         TEXT NOT NULL CHECK (role IN ('trainer', 'owner', 'admin')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.users (id, name, email, avatar, avatar_color, role)
VALUES
  ('00000000-0000-0000-0000-000000000201', 'Marcus R.',  'marcus@demo.askmoses.ai',  'MR', 'blue',   'trainer'),
  ('00000000-0000-0000-0000-000000000202', 'Jamie L.',   'jamie@demo.askmoses.ai',   'JL', 'purple', 'trainer'),
  ('00000000-0000-0000-0000-000000000203', 'Jordan K.',  'jordan@demo.askmoses.ai',  'JK', 'green',  'trainer'),
  ('00000000-0000-0000-0000-000000000204', 'Taylor M.',  'taylor@demo.askmoses.ai',  'TM', 'red',    'trainer')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  email        = EXCLUDED.email,
  avatar       = EXCLUDED.avatar,
  avatar_color = EXCLUDED.avatar_color,
  role         = EXCLUDED.role;

-- ─── 3. Trainers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trainers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES public.users(id) ON DELETE CASCADE,
  owner_id                  UUID,
  org_id                    UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  total_calls               INT DEFAULT 0,
  close_rate                INT DEFAULT 0,
  close_delta               INT DEFAULT 0,
  score                     INT DEFAULT 0,
  score_delta               INT DEFAULT 0,
  last_active               TEXT,
  score_discovery           INT DEFAULT 0,
  score_problem_agitation   INT DEFAULT 0,
  score_offer_presentation  INT DEFAULT 0,
  score_objection_handling  INT DEFAULT 0,
  score_close_next_steps    INT DEFAULT 0,
  updated_at                TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.trainers (
  id, user_id, org_id,
  total_calls, close_rate, close_delta, score, score_delta, last_active,
  score_discovery, score_problem_agitation, score_offer_presentation,
  score_objection_handling, score_close_next_steps
)
VALUES
  (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000100',
    28, 74, 9, 91, 11, 'Active today',
    94, 89, 95, 81, 90
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000100',
    22, 68, 4, 87, 7, 'Yesterday',
    88, 88, 84, 81, 82
  ),
  (
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000100',
    19, 61, 1, 79, 3, 'Active today',
    79, 61, 80, 65, 65
  ),
  (
    '00000000-0000-0000-0000-000000000304',
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000100',
    14, 55, -2, 74, -12, '3 days ago',
    67, 58, 70, 55, 63
  )
ON CONFLICT (id) DO UPDATE SET
  org_id                   = EXCLUDED.org_id,
  total_calls              = EXCLUDED.total_calls,
  close_rate               = EXCLUDED.close_rate,
  close_delta              = EXCLUDED.close_delta,
  score                    = EXCLUDED.score,
  score_delta              = EXCLUDED.score_delta,
  last_active              = EXCLUDED.last_active,
  score_discovery          = EXCLUDED.score_discovery,
  score_problem_agitation  = EXCLUDED.score_problem_agitation,
  score_offer_presentation = EXCLUDED.score_offer_presentation,
  score_objection_handling = EXCLUDED.score_objection_handling,
  score_close_next_steps   = EXCLUDED.score_close_next_steps,
  updated_at               = now();

-- ─── 4. Vincular org_id à rubric existente (criada em 001) ───────────────────

UPDATE public.rubrics
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';

-- Vincular criteria ao org_id
UPDATE public.criteria
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';

-- ─── 5. Calls (21 calls do mock) ─────────────────────────────────────────────

INSERT INTO public.calls (
  id, rubric_id, org_id, trainer_id, trainer_name, trainer_email, client_name,
  transcript, overall_score, total_criteria, criteria, summary,
  strengths, improvements, call_outcome, detected_outcome,
  email_sent, created_at, updated_at
)
VALUES
  -- Marcus R. (7 calls)
  (
    '00000000-0000-0000-0000-000000000601', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Bob W.',
    'Marcus: Hi Bob, thanks for making time today. Before anything else, tell me — what''s going on with Rex that brought you to us?
Bob: Man, he just doesn''t listen to anything. We can barely leave the house with him.
Marcus: I get it. When you say he doesn''t listen — give me a concrete example from recently.
Bob: Last week he escaped the yard for the third time. We spent two hours looking for him in the neighborhood.
Marcus: Wow, that must''ve been terrifying. Does this affect your daily life beyond the safety concern?
Bob: Absolutely. My daughter is scared to play with him now, and my wife said if it doesn''t get fixed, we''ll have to rehome him.
Marcus: I understand the gravity of that. Before I show you what we do — have you tried anything before? Group classes, YouTube, another trainer?
...',
    94, 5,
    '[{"name":"Discovery","score":96,"feedback":"Evaluated"},{"name":"Problem Agitation","score":91,"feedback":"Evaluated"},{"name":"Offer Presentation","score":97,"feedback":"Evaluated"},{"name":"Objection Handling","score":84,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":92,"feedback":"Evaluated"}]'::jsonb,
    'Excellent performance. Marcus demonstrated complete mastery of the discovery process, asking 4 open-ended questions before any presentation. The close was natural and pressure-free.',
    ARRAY['Asked 4 open-ended questions before presenting any offer','Identified the main pain point (Rex escaping the yard) in under 5 minutes','Handled price objection using concrete ROI: "how much does a lost dog cost?"'],
    ARRAY['Could have deepened problem agitation more before moving to the offer'],
    'closed', 'closed', false, '2026-03-22T10:00:00Z', '2026-03-22T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000602', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Sarah K.',
    'Marcus: Sarah, tell me a bit about Thor. What motivated you to reach out today?
Sarah: He''s destroying everything at home when we leave. Sofa, baseboards, he was even scratching the door...
Marcus: How long has this been going on?
Sarah: Since we went back to working in-office, about 4 months or so.
...',
    91, 5,
    '[{"name":"Discovery","score":95,"feedback":"Evaluated"},{"name":"Problem Agitation","score":88,"feedback":"Evaluated"},{"name":"Offer Presentation","score":94,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":90,"feedback":"Evaluated"}]'::jsonb,
    'Great call. Marcus used the open-ended questioning method masterfully. The objection moment was handled well by redirecting focus to the value of the transformation.',
    ARRAY['Discovered in 3 questions that the dog was destroying furniture due to separation anxiety','Presented the offer as the exact solution for the identified pain','Closed without a discount, holding full price'],
    ARRAY['Problem agitation could have been more specific with numbers and costs'],
    'closed', 'closed', false, '2026-03-20T10:00:00Z', '2026-03-20T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000603', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Mike D.',
    'Marcus: Mike, what''s going on with Bolt?
Mike: He pulls the leash like crazy. I walk crooked from holding him so tight. I''m embarrassed to take him to the park...
...',
    89, 5,
    '[{"name":"Discovery","score":93,"feedback":"Evaluated"},{"name":"Problem Agitation","score":87,"feedback":"Evaluated"},{"name":"Offer Presentation","score":92,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":88,"feedback":"Evaluated"}]'::jsonb,
    'Solid call. Discovery well executed, offer presented at the right time. Minor hesitation on the time objection, but handled well.',
    ARRAY['Discovered the real issue was embarrassment on the street, not just behavior at home','Used specific social proof: "we had a Golden with the same problem..."'],
    ARRAY['Could have spent more time in the agitation phase before presenting the solution'],
    'closed', 'closed', false, '2026-03-18T10:00:00Z', '2026-03-18T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000604', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Linda P.',
    'Marcus: Linda, how old is Bella now?
Linda: Almost 8 months. And she''s already too big for us to hold when she gets hyper...
...',
    88, 5,
    '[{"name":"Discovery","score":92,"feedback":"Evaluated"},{"name":"Problem Agitation","score":86,"feedback":"Evaluated"},{"name":"Offer Presentation","score":91,"feedback":"Evaluated"},{"name":"Objection Handling","score":79,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":88,"feedback":"Evaluated"}]'::jsonb,
    'Good performance. Longer call than usual, but Marcus maintained control of the conversation throughout.',
    ARRAY['Kept the prospect engaged for 45 minutes with strategic questions','Created real urgency by mentioning limited spots in the in-person program'],
    ARRAY['Next steps could have been more specific — ended without a set date'],
    'closed', 'closed', false, '2026-03-15T10:00:00Z', '2026-03-15T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000605', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Tom R.',
    'Marcus: Tom, first of all — do you already know our method or are you coming in fresh?
Tom: I''ve done a lot of research. Saw the testimonials on Instagram. Just want to know how it works in practice.
...',
    86, 5,
    '[{"name":"Discovery","score":91,"feedback":"Evaluated"},{"name":"Problem Agitation","score":84,"feedback":"Evaluated"},{"name":"Offer Presentation","score":89,"feedback":"Evaluated"},{"name":"Objection Handling","score":78,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":86,"feedback":"Evaluated"}]'::jsonb,
    'Efficient and quick call. Marcus correctly identified that Tom was ready to buy from the start and adjusted the pace accordingly.',
    ARRAY['Correctly read that the prospect was qualified and accelerated the call','Presented the plans in ascending order of value'],
    ARRAY['Discovery was a bit short — could have extracted more information'],
    'closed', 'closed', false, '2026-03-12T10:00:00Z', '2026-03-12T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000606', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Amy C.',
    'Marcus: Amy, tell me — when you picture Duke fully trained, how do you see your day-to-day looking different?
Amy: It would be amazing. We could take him anywhere without stress...
...',
    85, 5,
    '[{"name":"Discovery","score":93,"feedback":"Evaluated"},{"name":"Problem Agitation","score":88,"feedback":"Evaluated"},{"name":"Offer Presentation","score":90,"feedback":"Evaluated"},{"name":"Objection Handling","score":76,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":83,"feedback":"Evaluated"}]'::jsonb,
    'Excellent discovery and presentation. The call didn''t close because Amy needed to confirm schedule availability with her husband — follow-up booked for 2 days out.',
    ARRAY['Identified the co-decision maker (husband) before attempting to close','Left the follow-up with a specific date and time, not open-ended'],
    ARRAY['Could have suggested including the husband on the call instead of rescheduling'],
    'follow_up', 'follow_up', false, '2026-03-09T10:00:00Z', '2026-03-09T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000607', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000301',
    'Marcus R.', 'marcus@demo.askmoses.ai', 'Chris B.',
    'Marcus: Chris, in the current situation without training — how much do you think Max''s behavior is actually "costing" you?
Chris: Never thought about it that way...
Marcus: The couch he destroyed, the vet visits from stress, the restriction of traveling with him...
...',
    82, 5,
    '[{"name":"Discovery","score":90,"feedback":"Evaluated"},{"name":"Problem Agitation","score":85,"feedback":"Evaluated"},{"name":"Offer Presentation","score":88,"feedback":"Evaluated"},{"name":"Objection Handling","score":72,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":82,"feedback":"Evaluated"}]'::jsonb,
    'Good call with consistent close. The price objection came in stronger than usual and Marcus took a moment to regain control.',
    ARRAY['Kept a calm tone during the more resistant price objection','Used the strategic silence technique after presenting the price'],
    ARRAY['The response to the price objection could have been quicker and less defensive'],
    'closed', 'closed', false, '2026-03-06T10:00:00Z', '2026-03-06T10:00:00Z'
  ),
  -- Jamie L. (5 calls)
  (
    '00000000-0000-0000-0000-000000000608', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Diana M.',
    'Jamie: Diana, what happens at your house when you need to have guests over?
Diana: It''s chaos. Toby barks and jumps on everyone. I even stopped having my mom over because of it...
Jamie: How long has this been going on?
Diana: Over a year. I''m exhausted...
...',
    90, 5,
    '[{"name":"Discovery","score":91,"feedback":"Evaluated"},{"name":"Problem Agitation","score":90,"feedback":"Evaluated"},{"name":"Offer Presentation","score":88,"feedback":"Evaluated"},{"name":"Objection Handling","score":84,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":87,"feedback":"Evaluated"}]'::jsonb,
    'Excellent call from Jamie. The problem agitation was particularly strong — Diana became visibly emotional talking about how much stress the dog was causing.',
    ARRAY['Problem agitation delivered with genuine empathy — didn''t come across as manipulative','Close made before resistance surfaced'],
    ARRAY['Discovery could have explored more about prior attempts'],
    'closed', 'closed', false, '2026-03-21T10:00:00Z', '2026-03-21T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000609', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Robert L.',
    'Jamie: Robert, when you say Luna "doesn''t focus" — describe a specific situation from last week.
Robert: Just yesterday. I tried teaching "sit" for half an hour. She knows how to do it, but ignores me when she wants...
...',
    85, 5,
    '[{"name":"Discovery","score":88,"feedback":"Evaluated"},{"name":"Problem Agitation","score":86,"feedback":"Evaluated"},{"name":"Offer Presentation","score":84,"feedback":"Evaluated"},{"name":"Objection Handling","score":80,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":82,"feedback":"Evaluated"}]'::jsonb,
    'Well-conducted and efficient call. Robert was already aware of the problem and Jamie correctly calibrated the intensity of the agitation.',
    ARRAY['Correctly calibrated agitation level for a prospect already aware of the problem','Presented cases of a similar breed (Border Collie)'],
    ARRAY['The close could have been more directive — felt slightly hesitant'],
    'closed', 'closed', false, '2026-03-19T10:00:00Z', '2026-03-19T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000610', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Karen H.',
    'Jamie: Karen, what made you decide to look for a professional trainer now?
Karen: My husband was reluctant, but after Buddy scratched the child, we agreed we needed help...
...',
    82, 5,
    '[{"name":"Discovery","score":87,"feedback":"Evaluated"},{"name":"Problem Agitation","score":85,"feedback":"Evaluated"},{"name":"Offer Presentation","score":82,"feedback":"Evaluated"},{"name":"Objection Handling","score":78,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":80,"feedback":"Evaluated"}]'::jsonb,
    'Good call. Karen is a shared decision-maker with her husband and Jamie identified this halfway through — follow-up to include him.',
    ARRAY['Didn''t try to close knowing there was another decision-maker in the equation','Maintained Karen''s engagement for the next call'],
    ARRAY['The co-decision maker question could have been identified earlier in discovery'],
    'follow_up', 'follow_up', false, '2026-03-16T10:00:00Z', '2026-03-16T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000611', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Steve N.',
    'Jamie: Steve, quick question — what would change in your routine if Rocky was fully obedient in the first 3 months?
Steve: Mainly the runs. He has potential but doesn''t focus...
...',
    79, 5,
    '[{"name":"Discovery","score":84,"feedback":"Evaluated"},{"name":"Problem Agitation","score":82,"feedback":"Evaluated"},{"name":"Offer Presentation","score":80,"feedback":"Evaluated"},{"name":"Objection Handling","score":74,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":78,"feedback":"Evaluated"}]'::jsonb,
    'Shorter call than ideal. Jamie closed but left money on the table — Steve could have bought a more complete plan with more agitation.',
    ARRAY['Consistent close even in a shorter call','Direct and no-nonsense tone, appropriate for the prospect''s profile'],
    ARRAY['Problem agitation too fast — didn''t explore the emotional costs of the problem'],
    'closed', 'closed', false, '2026-03-13T10:00:00Z', '2026-03-13T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000612', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000302',
    'Jamie L.', 'jamie@demo.askmoses.ai', 'Nancy W.',
    'Nancy: The investment is above what I had planned to spend...
Jamie: I understand, but our program has excellent value for money compared to...
Nancy: Sure, but I don''t have that amount available right now...
...',
    75, 5,
    '[{"name":"Discovery","score":85,"feedback":"Evaluated"},{"name":"Problem Agitation","score":80,"feedback":"Evaluated"},{"name":"Offer Presentation","score":78,"feedback":"Evaluated"},{"name":"Objection Handling","score":62,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":70,"feedback":"Evaluated"}]'::jsonb,
    'Discovery and agitation well done, but Jamie couldn''t overcome the price objection effectively. Nancy left without buying and without a clear next step.',
    ARRAY['Good rapport built in the opening phase','Discovery correctly identified the real pain'],
    ARRAY['Response to price objection was defensive — went into justification mode instead of reframing','No next step defined — call ended without commitment'],
    'no_decision', 'no_decision', false, '2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z'
  ),
  -- Jordan K. (5 calls)
  (
    '00000000-0000-0000-0000-000000000613', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Peter G.',
    'Jordan: Peter, tell me what''s going on with Gobi.
Peter: He''s super hyper. Jumps on everyone, can''t stay still.
Jordan: Got it. So what we offer is an 8-week program...
...',
    81, 5,
    '[{"name":"Discovery","score":82,"feedback":"Evaluated"},{"name":"Problem Agitation","score":65,"feedback":"Evaluated"},{"name":"Offer Presentation","score":83,"feedback":"Evaluated"},{"name":"Objection Handling","score":70,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":68,"feedback":"Evaluated"}]'::jsonb,
    'Reasonable discovery. Jordan identified the problem but moved too quickly to the offer presentation. Problem agitation was superficial.',
    ARRAY['Offer presentation clear and well-structured','Confident tone throughout the call'],
    ARRAY['Jumped from discovery directly to the offer without adequately agitating the problem','Follow-up was vague — "I''ll send you the material" with no date'],
    'follow_up', 'follow_up', false, '2026-03-22T10:00:00Z', '2026-03-22T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000614', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Donna F.',
    'Jordan: Donna, I''ll be straight — if you sign up today, I can apply a 10% discount...
Donna: Oh, that works better for me...
...',
    75, 5,
    '[{"name":"Discovery","score":80,"feedback":"Evaluated"},{"name":"Problem Agitation","score":62,"feedback":"Evaluated"},{"name":"Offer Presentation","score":81,"feedback":"Evaluated"},{"name":"Objection Handling","score":66,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":65,"feedback":"Evaluated"}]'::jsonb,
    'Closed but with an unnecessary discount. Jordan didn''t create enough value in the agitation phase and caved on price before exploring other objections.',
    ARRAY['Persisted through to close despite objection','Knows the product well and presented it clearly'],
    ARRAY['Gave a discount without trying to resolve the objection in other ways','Problem agitation too weak — Donna wasn''t sufficiently committed'],
    'closed', 'closed', false, '2026-03-19T10:00:00Z', '2026-03-19T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000615', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Mark T.',
    'Jordan: Mark, great to meet you. So you''re interested in training for Rocky, right?
Mark: Yeah, saw it on Google...
Jordan: Great! Let me tell you about our program...
...',
    73, 5,
    '[{"name":"Discovery","score":78,"feedback":"Evaluated"},{"name":"Problem Agitation","score":60,"feedback":"Evaluated"},{"name":"Offer Presentation","score":79,"feedback":"Evaluated"},{"name":"Objection Handling","score":63,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":62,"feedback":"Evaluated"}]'::jsonb,
    'Call with a good start but lost the thread halfway. Jordan moved to the offer too early and couldn''t regain the prospect''s engagement.',
    ARRAY['Good call opening, created a positive initial atmosphere'],
    ARRAY['Presented the offer at minute 10 — too early, before the problem was well established','Didn''t try to recover when sensing the prospect was disengaged'],
    'no_decision', 'no_decision', false, '2026-03-16T10:00:00Z', '2026-03-16T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000616', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'Susan B.',
    'Jordan: Susan, what''s Coco''s issue?
Susan: Oh, he''s kind of hyper...
Jordan: Got it. Want me to send you more info about the program?
...',
    70, 5,
    '[{"name":"Discovery","score":76,"feedback":"Evaluated"},{"name":"Problem Agitation","score":58,"feedback":"Evaluated"},{"name":"Offer Presentation","score":78,"feedback":"Evaluated"},{"name":"Objection Handling","score":62,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":60,"feedback":"Evaluated"}]'::jsonb,
    'Weak call. Jordan managed to present the product but without creating the urgency context needed for the close.',
    ARRAY['Solid product knowledge'],
    ARRAY['Very shallow discovery — only 2 questions before moving to the offer','Problem agitation practically non-existent','Follow-up scheduled but with no real qualification of interest'],
    'follow_up', 'follow_up', false, '2026-03-13T10:00:00Z', '2026-03-13T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000617', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000303',
    'Jordan K.', 'jordan@demo.askmoses.ai', 'James R.',
    'Jordan: James, tell me about Brutus.
James: He''s just too big for us to control...
Jordan: Got it. Our program fixes that. The investment is X...
James: Hmm, let me think...
...',
    65, 5,
    '[{"name":"Discovery","score":68,"feedback":"Evaluated"},{"name":"Problem Agitation","score":55,"feedback":"Evaluated"},{"name":"Offer Presentation","score":72,"feedback":"Evaluated"},{"name":"Objection Handling","score":60,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":58,"feedback":"Evaluated"}]'::jsonb,
    'Very short and shallow call. Jordan couldn''t deepen the conversation enough to create value.',
    ARRAY['At least the call happened — Jordan needed more discovery practice'],
    ARRAY['Call ended too early — James needed more time to build trust','No real attempt at problem agitation','Premature close without a value foundation'],
    'no_decision', 'no_decision', false, '2026-03-10T10:00:00Z', '2026-03-10T10:00:00Z'
  ),
  -- Taylor M. (4 calls)
  (
    '00000000-0000-0000-0000-000000000618', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Helen K.',
    'Taylor: Helen, which command specifically is Ziggy having trouble with? Stay, sit, or is it more aggression?
Helen: He''s very reactive to other dogs on walks...
Taylor: I see. Reactivity is one of our specialties...
...',
    74, 5,
    '[{"name":"Discovery","score":70,"feedback":"Evaluated"},{"name":"Problem Agitation","score":60,"feedback":"Evaluated"},{"name":"Offer Presentation","score":74,"feedback":"Evaluated"},{"name":"Objection Handling","score":58,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":65,"feedback":"Evaluated"}]'::jsonb,
    'Taylor showed product knowledge but struggled to connect the product to Helen''s real pain. The call was too technical and not emotional enough.',
    ARRAY['Knows the program specs and differentiators well'],
    ARRAY['Discovery too technical — focused on dog behaviors, not on the impact to the owner''s life','When Helen hesitated, Taylor pulled back instead of advancing with empathy'],
    'no_decision', 'no_decision', false, '2026-03-20T10:00:00Z', '2026-03-20T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000619', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Paul M.',
    'Paul: It''s expensive for what it is...
Taylor: I understand the price might seem high, but if you break it down by week...
Paul: Hmm...
Taylor: I can also explain what''s included...
...',
    71, 5,
    '[{"name":"Discovery","score":68,"feedback":"Evaluated"},{"name":"Problem Agitation","score":58,"feedback":"Evaluated"},{"name":"Offer Presentation","score":72,"feedback":"Evaluated"},{"name":"Objection Handling","score":55,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":62,"feedback":"Evaluated"}]'::jsonb,
    'Second consecutive call without closing. Taylor is clearly struggling in the objection stage — goes defensive instead of keeping focus on value.',
    ARRAY['Structured and complete program presentation'],
    ARRAY['Price objection: immediately went into justification mode','Problem agitation too quick — Paul didn''t feel real urgency','Didn''t try to involve the prospect in the solution during the call'],
    'no_decision', 'no_decision', false, '2026-03-17T10:00:00Z', '2026-03-17T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000620', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'Alice N.',
    'Taylor: Alice, what motivated you to look into dog training?
Alice: Mel has been chewing things around the house a bit...
Taylor: Got it. Let me send you the program info via WhatsApp?
...',
    68, 5,
    '[{"name":"Discovery","score":65,"feedback":"Evaluated"},{"name":"Problem Agitation","score":57,"feedback":"Evaluated"},{"name":"Offer Presentation","score":71,"feedback":"Evaluated"},{"name":"Objection Handling","score":53,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":61,"feedback":"Evaluated"}]'::jsonb,
    'Very short call. Taylor seems to be feeling insecure — discovery questions were timid and the offer presentation was too rushed.',
    ARRAY['Scheduled a follow-up — at least didn''t leave without a next step'],
    ARRAY['Discovery with only 2 questions before moving to the offer','Insecure tone in the presentation — Alice probably didn''t perceive the real value','Call ended without Taylor knowing the real reason for the hesitation'],
    'follow_up', 'follow_up', false, '2026-03-14T10:00:00Z', '2026-03-14T10:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000621', 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000304',
    'Taylor M.', 'taylor@demo.askmoses.ai', 'George T.',
    'George: How much does it cost?
Taylor: The investment is... it depends on the plan. Options start at...
George: Yeah, but what''s the most basic one?
Taylor: The basic includes...
George: Hmm, let me think...
Taylor: Of course, no problem...
...',
    65, 5,
    '[{"name":"Discovery","score":63,"feedback":"Evaluated"},{"name":"Problem Agitation","score":55,"feedback":"Evaluated"},{"name":"Offer Presentation","score":70,"feedback":"Evaluated"},{"name":"Objection Handling","score":52,"feedback":"Evaluated"},{"name":"Close & Next Steps","score":60,"feedback":"Evaluated"}]'::jsonb,
    'Concerning call. Taylor is showing clear signs of low confidence. Voice was hesitant and he let the prospect lead the entire conversation.',
    ARRAY['Managed to keep George on the call for 25 minutes'],
    ARRAY['Let the prospect drive the call — lost control of the conversation','Made no real attempt to close','Ended the call with "let me think about what you said" — passive position'],
    'no_decision', 'no_decision', false, '2026-03-11T10:00:00Z', '2026-03-11T10:00:00Z'
  )
ON CONFLICT (id) DO UPDATE SET
  org_id           = EXCLUDED.org_id,
  trainer_id       = EXCLUDED.trainer_id,
  overall_score    = EXCLUDED.overall_score,
  call_outcome     = EXCLUDED.call_outcome,
  detected_outcome = EXCLUDED.detected_outcome,
  updated_at       = now();

-- ─── 6. Insights ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.insights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('risk', 'warning', 'tip', 'positive')),
  icon       TEXT,
  title      TEXT NOT NULL,
  tag        TEXT,
  tag_color  TEXT DEFAULT 'blue',
  summary    TEXT,
  action     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insights_service_role_all" ON public.insights
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = (auth.jwt()->'app_metadata'->>'org_id')::uuid);

INSERT INTO public.insights (id, org_id, type, icon, title, tag, tag_color, summary, action)
VALUES
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000100',
    'risk', '🚨',
    'Objection Handling is the biggest revenue leak',
    'Team pattern', 'red',
    '3 of 4 trainers score below 70 on Objection Handling. Calls that skip this step close at 38% vs. 71% when executed correctly.',
    'Schedule a 30-min role-play focused on price objections. Use Marcus''s calls as the benchmark.'
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000100',
    'warning', '⚠️',
    'Taylor is at risk of disengagement',
    'Trainer alert', 'amber',
    'Score dropped 12pts in 2 weeks, call volume down 40%, and close rate is the lowest at 55%. This is a coaching emergency, not a performance issue.',
    'Schedule a 1:1 with Taylor. Review the last 3 calls and identify where confidence dropped.'
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000100',
    'tip', '💡',
    'Marcus''s Discovery can elevate the whole team',
    'Best practices', 'blue',
    'Marcus scores 94 in Discovery — 11pts above average. He asks 3 open-ended questions before presenting the offer. No other trainer replicates this.',
    'Pull 2 clips from Marcus''s calls and share as training material at the next team meeting.'
  ),
  (
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000100',
    'positive', '📈',
    'Coaching working — close rate +7pts in 6 weeks',
    'ROI signal', 'green',
    'Since starting AI coaching, close rate went from 57% → 64%. Biggest gain in Offer Presentation (+12pts team average).',
    'Keep the cadence. Consider daily uploads for faster feedback loops.'
  )
ON CONFLICT (id) DO UPDATE SET
  org_id    = EXCLUDED.org_id,
  title     = EXCLUDED.title,
  summary   = EXCLUDED.summary,
  action    = EXCLUDED.action;

-- ─── 7. Clients (visão admin — empresas clientes do SaaS) ────────────────────

CREATE TABLE IF NOT EXISTS public.clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  plan              TEXT NOT NULL CHECK (plan IN ('Starter', 'Pro', 'Pro+RAG')),
  calls_this_month  INT DEFAULT 0,
  avg_score         INT DEFAULT 0,
  mrr               NUMERIC DEFAULT 0,
  health            TEXT NOT NULL CHECK (health IN ('healthy', 'at-risk', 'churning')),
  trainers_count    INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (admin) acessa clients
CREATE POLICY "clients_service_role_all" ON public.clients
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.clients (id, name, plan, calls_this_month, avg_score, mrr, health, trainers_count)
VALUES
  ('00000000-0000-0000-0000-000000000401', 'Paw Masters Academy',  'Pro',     83, 83, 497,  'healthy', 4),
  ('00000000-0000-0000-0000-000000000402', 'Elite K9 Training',    'Starter', 94, 76, 297,  'at-risk', 6),
  ('00000000-0000-0000-0000-000000000403', 'Dog Whisperers Co.',   'Pro+RAG', 70, 88, 697,  'healthy', 3)
ON CONFLICT (id) DO UPDATE SET
  plan             = EXCLUDED.plan,
  calls_this_month = EXCLUDED.calls_this_month,
  avg_score        = EXCLUDED.avg_score,
  mrr              = EXCLUDED.mrr,
  health           = EXCLUDED.health,
  trainers_count   = EXCLUDED.trainers_count;

-- ─── 8. Vincular calls existentes (uploaded via dashboard) ao org de demo ────
-- Calls inseridas antes desta migration não têm org_id — vincular à org de demo.

UPDATE public.calls
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- ─── 9. Vincular rubrics e criteria sem org_id à org de demo ─────────────────

UPDATE public.rubrics
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

UPDATE public.criteria
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;

-- ─── 10. Vincular scripts sem org_id à org de demo ───────────────────────────

UPDATE public.scripts
SET org_id = '00000000-0000-0000-0000-000000000100'
WHERE org_id IS NULL;


-- BEGIN: 014_org_id_jwt_trigger.sql
-- ============================================================
-- 014_org_id_jwt_trigger.sql
-- Atualiza o trigger set_role_claim para propagar org_id
-- no app_metadata do JWT, além do role já existente.
--
-- Fluxo:
--   1. profiles recebe INSERT ou UPDATE (role ou org_id)
--   2. Trigger lê profiles.role e profiles.org_id
--   3. Faz UPSERT no raw_app_meta_data de auth.users
--   4. Na próxima requisição autenticada o JWT já carrega
--      app_metadata.org_id → RLS policies filtram por ele
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_role_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role',   NEW.role,
         'org_id', NEW.org_id::text
       )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- O trigger já existe (criado em create-profiles-table.sql).
-- Recriar para garantir que aponta para a função atualizada.
DROP TRIGGER IF EXISTS on_profile_upserted ON public.profiles;
CREATE TRIGGER on_profile_upserted
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_role_claim();

-- ─── Propagação manual para usuários de demo já existentes ───────────────────
-- Dispara a função para todos os profiles que já têm org_id definido,
-- garantindo que o JWT deles seja atualizado sem necessidade de re-login.

DO $$
DECLARE
  prof RECORD;
BEGIN
  FOR prof IN
    SELECT id, role, org_id FROM public.profiles WHERE org_id IS NOT NULL
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
           'role',   prof.role,
           'org_id', prof.org_id::text
         )
    WHERE id = prof.id;
  END LOOP;
END;
$$;


-- BEGIN: 017_add_rubric_org_fields.sql
-- Migration: Add org fields and personalisation columns to rubrics (DM-04, RB-16–RB-20)
-- Depends on: organizations table (TASK-F2-001)

-- 1. New columns
-- NOTE: org_id FK may already exist because rubrics.org_id/FK is created in 012_create_organizations
ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS org_id UUID,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role_label TEXT NOT NULL DEFAULT 'trainer',
  ADD COLUMN IF NOT EXISTS call_goal TEXT NOT NULL DEFAULT 'close deal',
  ADD COLUMN IF NOT EXISTS coaching_boundaries TEXT,
  ADD COLUMN IF NOT EXISTS coaching_tone TEXT NOT NULL DEFAULT 'encouraging'
    CHECK (coaching_tone IN ('encouraging', 'direct', 'balanced')),
  ADD COLUMN IF NOT EXISTS outcome_options JSONB NOT NULL
    DEFAULT '["closed", "not_closed", "partial", "no_outcome"]'::jsonb;

-- 2. Unique partial index: only one default rubric per org (RB-06)
CREATE UNIQUE INDEX IF NOT EXISTS rubrics_one_default_per_org
  ON public.rubrics (org_id)
  WHERE is_default = true;

-- 3. Backfill demo data — patch the seeded rubric
UPDATE public.rubrics
SET
  org_id              = '00000000-0000-0000-0000-000000000100',
  is_default          = true,
  role_label          = 'trainer',
  call_goal           = 'close deal',
  coaching_tone       = 'encouraging',
  outcome_options     = '["closed", "not_closed", "partial", "no_outcome"]'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000001';


-- BEGIN: 018_create_plans_and_link_clients.sql
-- ============================================================
-- 018_create_plans_and_link_clients.sql
-- Plano vira entidade. Client recebe plan_id (FK plans) e
-- org_id (FK organizations 1:1). Organization recebe client_id
-- (FK reverso). Coluna text `clients.plan` é descartada.
-- ============================================================

-- ─── 1. Tabela plans ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE CHECK (code IN ('starter', 'pro', 'pro_rag')),
  name               TEXT NOT NULL,
  price_cents        INT NOT NULL DEFAULT 0,
  timeline_weeks     INT NOT NULL DEFAULT 0,
  has_rag            BOOLEAN NOT NULL DEFAULT false,
  has_twilio         BOOLEAN NOT NULL DEFAULT false,
  has_manual_upload  BOOLEAN NOT NULL DEFAULT true,
  max_sales_people   INT,
  features           JSONB DEFAULT '[]'::jsonb,
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_service_role_all" ON public.plans;
CREATE POLICY "plans_service_role_all" ON public.plans
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans
  FOR SELECT USING (true);

-- ─── 2. Seed dos 3 planos ────────────────────────────────────────────────────

INSERT INTO public.plans (id, code, name, price_cents, timeline_weeks, has_rag, has_twilio, has_manual_upload, max_sales_people, features)
VALUES
  (
    '00000000-0000-0000-0000-0000000000a1',
    'starter',
    'Starter',
    405000,
    2,
    false, false, true,
    4,
    '["Script & Rubric Manager","Manual call upload (audio or transcript)","AI analysis (Whisper + GPT-4o)","Post-call coaching email","Aggregated summary","History page"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    'pro',
    'Pro',
    810000,
    3,
    false, true, true,
    NULL,
    '["Everything in Starter","Twilio/GHL webhook integration","Automated call ingestion","Contact metadata sync","Zero manual upload"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-0000000000a3',
    'pro_rag',
    'Pro + RAG',
    1140700,
    4,
    true, true, true,
    NULL,
    '["Everything in Pro","RAG system (vector search)","Multi-document knowledge base","Context-aware coaching","Training material integration","Dynamic reference lookup"]'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name              = EXCLUDED.name,
  price_cents       = EXCLUDED.price_cents,
  timeline_weeks    = EXCLUDED.timeline_weeks,
  has_rag           = EXCLUDED.has_rag,
  has_twilio        = EXCLUDED.has_twilio,
  has_manual_upload = EXCLUDED.has_manual_upload,
  max_sales_people  = EXCLUDED.max_sales_people,
  features          = EXCLUDED.features;

-- ─── 3. Adicionar plan_id e org_id em clients ────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE RESTRICT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_plan_id_idx ON public.clients(plan_id);
CREATE INDEX IF NOT EXISTS clients_org_id_idx  ON public.clients(org_id);

-- ─── 4. Adicionar client_id em organizations (espelho 1:1) ───────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_client_id_idx ON public.organizations(client_id);

-- ─── 5. Backfill: mapear coluna text `plan` → plan_id ────────────────────────
-- Só executa se a coluna text `plan` ainda existir.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'plan'
  ) THEN
    UPDATE public.clients c
    SET plan_id = p.id
    FROM public.plans p
    WHERE c.plan_id IS NULL
      AND CASE
            WHEN c.plan = 'Starter' THEN p.code = 'starter'
            WHEN c.plan = 'Pro'     THEN p.code = 'pro'
            WHEN c.plan = 'Pro+RAG' THEN p.code = 'pro_rag'
            ELSE false
          END;
  END IF;
END;
$$;

-- ─── 6. Drop coluna text `plan` (após backfill validado) ─────────────────────

ALTER TABLE public.clients DROP COLUMN IF EXISTS plan;

-- ─── 7. Tornar plan_id obrigatório ───────────────────────────────────────────
-- Comentado por padrão: descomente após confirmar que todos os clients têm plan_id.
-- ALTER TABLE public.clients ALTER COLUMN plan_id SET NOT NULL;


-- BEGIN: 019_seed_three_clients.sql
-- ============================================================
-- 019_seed_three_clients.sql
-- Seed das 3 organizations × 3 clients × 3 planos.
--
-- Pré-requisitos:
--   - 012_create_organizations.sql aplicado (cria organizations,
--     habilita RLS por org_id em todas as tabelas)
--   - 013_seed_demo_org.sql aplicado (criou org `…000100` + tabelas
--     public.users, public.trainers, public.clients e a rubric demo)
--   - 018_create_plans_and_link_clients.sql aplicado (cria plans,
--     adiciona plan_id+org_id em clients e client_id em organizations)
--
-- O que este script faz:
--   1. Insere 2 novas orgs: K9 Elite Training (Pro+RAG) e Paw Academy (Starter)
--   2. UPSERT em clients (3 linhas), cada uma com plan_id e org_id
--      apontando para sua org tenant
--   3. Espelha organizations.client_id ← clients.id
--
-- Mapeamento autoritativo (alinhado com Supabase atual —
-- ver Downloads/{plans,clients,organizations}_rows.json):
--
--   org_id …000100  ↔  client …000801  →  Dog Wizard HQ      →  Pro      (a2)
--   org_id …000200  ↔  client …000803  →  K9 Elite Training  →  Pro+RAG  (a3)
--   org_id …000300  ↔  client …000802  →  Paw Academy        →  Starter  (a1)
--
-- Auth users, public.users (trainers/owner), trainers, calls e insights
-- dos novos tenants são criados pelo `setup-three-clients.mjs` para
-- garantir que public.users.id == auth.users.id (necessário para /api/me).
-- ============================================================


-- ─── 1. Criar 2 novas orgs ───────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, avg_ticket, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000200', 'K9 Elite Training', 1200, '2026-02-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000300', 'Paw Academy',       2200, '2025-11-20T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  avg_ticket = EXCLUDED.avg_ticket;


-- ─── 2. Inserir os 3 clients com plan_id + org_id ────────────────────────────

INSERT INTO public.clients (id, name, plan_id, org_id, calls_this_month, avg_score, mrr, health, trainers_count, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000801',
    'Dog Wizard HQ',
    (SELECT id FROM public.plans WHERE code = 'pro'),
    '00000000-0000-0000-0000-000000000100',
    20, 83, 1500, 'healthy', 4,
    '2026-01-15T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    'Paw Academy',
    (SELECT id FROM public.plans WHERE code = 'starter'),
    '00000000-0000-0000-0000-000000000300',
    8, 71, 500, 'at-risk', 4,
    '2026-02-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000803',
    'K9 Elite Training',
    (SELECT id FROM public.plans WHERE code = 'pro_rag'),
    '00000000-0000-0000-0000-000000000200',
    35, 88, 2500, 'healthy', 4,
    '2025-11-20T00:00:00Z'
  )
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  plan_id          = EXCLUDED.plan_id,
  org_id           = EXCLUDED.org_id,
  calls_this_month = EXCLUDED.calls_this_month,
  avg_score        = EXCLUDED.avg_score,
  mrr              = EXCLUDED.mrr,
  health           = EXCLUDED.health,
  trainers_count   = EXCLUDED.trainers_count;


-- ─── 3. Espelhar organizations.client_id ←  clients.id ───────────────────────

UPDATE public.organizations o
SET client_id = c.id
FROM public.clients c
WHERE c.org_id = o.id
  AND (o.client_id IS NULL OR o.client_id <> c.id);


-- ─── 4. Garantir que rubrics/criteria/calls antigos do org …100 ainda batem ──
-- (o seed 013 já vinculou tudo ao org …100; só re-confirmamos por segurança)

UPDATE public.rubrics  SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.criteria SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.calls    SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;
UPDATE public.scripts  SET org_id = '00000000-0000-0000-0000-000000000100' WHERE org_id IS NULL;


-- BEGIN: 020_make_rubric_id_nullable.sql
-- Make rubric_id nullable on calls table.
-- Calls uploaded without a configured rubric should still be saved.
ALTER TABLE public.calls
  ALTER COLUMN rubric_id DROP NOT NULL;


CREATE TABLE IF NOT EXISTS public.owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, company TEXT, plan TEXT, created_at TIMESTAMPTZ DEFAULT now()
);


-- BEGIN: 020_users_invite_fields.sql
-- ============================================================
-- 020_users_invite_fields.sql
-- Adiciona campos de convite à tabela public.users:
--   - org_id        → vincula owner/admin à organização (trainers
--                     já estão vinculados via public.trainers.org_id,
--                     mas owners/admins não tinham coluna própria)
--   - invited_by    → quem disparou o convite (FK → users.id)
--   - invited_at    → quando o convite foi enviado
--   - invite_status → 'pending' (link enviado) | 'accepted' (já fez login + senha)
--
-- Backfill: registros existentes são marcados como 'accepted'
-- (são os usuários demo, já ativos). O default passa a ser
-- 'pending' para forçar o fluxo correto em novos convites.
-- ============================================================

-- ─── 1. Novas colunas ────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS org_id        UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_by    UUID REFERENCES public.users(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_status TEXT;

CREATE INDEX IF NOT EXISTS users_org_id_idx        ON public.users(org_id);
CREATE INDEX IF NOT EXISTS users_invited_by_idx    ON public.users(invited_by);
CREATE INDEX IF NOT EXISTS users_invite_status_idx ON public.users(invite_status);

-- ─── 2. Backfill ─────────────────────────────────────────────────────────────

-- 2a. Trainers herdam org_id da row em public.trainers
UPDATE public.users u
SET    org_id = t.org_id
FROM   public.trainers t
WHERE  t.user_id = u.id
  AND  u.org_id IS NULL
  AND  t.org_id IS NOT NULL;

-- 2b. Owners herdam org_id via owners → clients (owners.company = clients.name)
UPDATE public.users u
SET    org_id = c.org_id
FROM   public.owners o
JOIN   public.clients c ON c.name = o.company
WHERE  u.id = o.user_id
  AND  u.org_id IS NULL
  AND  u.role = 'owner';

-- 2c. Admin fica com org_id = NULL (admin global, não pertence a uma org)

-- 2d. Todos os usuários existentes são considerados aceitos
UPDATE public.users
SET    invite_status = 'accepted'
WHERE  invite_status IS NULL;

-- ─── 3. Defaults e constraints ───────────────────────────────────────────────

ALTER TABLE public.users
  ALTER COLUMN invite_status SET DEFAULT 'pending';

ALTER TABLE public.users
  ALTER COLUMN invite_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_invite_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_invite_status_check
      CHECK (invite_status IN ('pending', 'accepted'));
  END IF;
END;
$$;


-- BEGIN: 021_fix_schema_gaps.sql
-- ============================================================
-- 021_fix_schema_gaps.sql
-- Consolida 4 gaps descobertos no setup do dev novo:
--   1. trainer_id ausente em calls       (013 inseria sem ALTER prévio)
--   2. rubric "Dog Training Sales Rubric" b4e99b19-… nunca era criada
--   3. UNIQUE em trainers.user_id ausente  (necessária pro upsert da setup-three-clients)
--   4. Tabela owners ausente              (referenciada por 020 backfill 2b e pela API)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. trainer_id em calls ──────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES public.trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calls_trainer_id_idx ON public.calls(trainer_id);

-- ─── 2. Rubric "Dog Training Sales Rubric" + 5 criteria ──────────────────────
-- Necessária pelo INSERT de calls do 013 (que tem rubric_id FK para essa).

INSERT INTO public.rubrics (id, name, description, is_active, org_id)
VALUES (
  'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
  'Dog Training Sales Rubric',
  'Rubric for evaluating dog trainer sales calls — Dog Wizard HQ',
  true,
  '00000000-0000-0000-0000-000000000100'
)
ON CONFLICT (id) DO UPDATE SET
  name   = EXCLUDED.name,
  org_id = EXCLUDED.org_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.criteria
    WHERE rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'
  ) THEN
    INSERT INTO public.criteria (rubric_id, name, description, sort_order, org_id) VALUES
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Discovery',          'Open-ended questions and active listening before any pitch.', 1, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Problem Agitation',  'Deepen the prospect pain — emotional and financial impact.',  2, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Offer Presentation', 'Connect the offer to the identified pain.',                  3, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Objection Handling', 'Reframe objections without defensive posture.',              4, '00000000-0000-0000-0000-000000000100'),
      ('b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d', 'Close & Next Steps', 'Clear commitment or next step before hanging up.',            5, '00000000-0000-0000-0000-000000000100');
  END IF;
END $$;

UPDATE public.criteria
SET    org_id = '00000000-0000-0000-0000-000000000100'
WHERE  rubric_id = 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'
  AND  org_id IS NULL;

-- ─── 3. UNIQUE em trainers.user_id ───────────────────────────────────────────
-- Necessária para upsert(onConflict: 'user_id') no setup-three-clients.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_id_key'
  ) THEN
    ALTER TABLE public.trainers ADD CONSTRAINT trainers_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- ─── 4. Tabela owners ────────────────────────────────────────────────────────
-- trainers.owner_id referencia owners.id (não users.id direto).
-- Usada por /api/invites e pelo setup-three-clients.

CREATE TABLE IF NOT EXISTS public.owners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  company    TEXT,
  plan       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owners_user_id_idx ON public.owners(user_id);

ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owners_service_role_all' AND tablename = 'owners') THEN
    CREATE POLICY owners_service_role_all ON public.owners
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owners_select_own' AND tablename = 'owners') THEN
    CREATE POLICY owners_select_own ON public.owners
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;


-- BEGIN: 022_call_outcome_enum.sql
-- ============================================================
-- 022_call_outcome_enum.sql
-- Converte call_outcome e detected_outcome de TEXT+CHECK para
-- ENUM nativo do Postgres (call_outcome_enum).
--
-- Mapeamento de valores legados (6 → 4):
--   closed                → closed
--   not_closed            → not_closed
--   partial               → partial
--   follow_up             → partial      (proposta com follow-up pendente)
--   objection_unresolved  → not_closed   (call completa, não fechou)
--   no_decision           → no_outcome   (sem resolução clara)
--   NULL                  → NULL         (DoD: NULL aceito)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Criar o tipo ENUM ────────────────────────────────────────────────────
DO $$
BEGIN
  -- Qualifica por schema: sem o JOIN em pg_namespace, um type homônimo em
  -- outro schema faria o IF pular o CREATE e quebrar o ALTER COLUMN abaixo.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'call_outcome_enum'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.call_outcome_enum AS ENUM (
      'closed',
      'not_closed',
      'partial',
      'no_outcome'
    );
  END IF;
END $$;

-- ─── 2. Remover CHECK constraints antigos ────────────────────────────────────
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_call_outcome_check;
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_detected_outcome_check;

-- ─── 3. Remover DEFAULT antigo (texto) — incompatível com cast pra ENUM ─────
ALTER TABLE public.calls ALTER COLUMN call_outcome DROP DEFAULT;

-- ─── 4. Mapear valores legados antes do cast ─────────────────────────────────
-- Idempotente: se já foi mapeado antes, o WHERE não casa nada.
UPDATE public.calls SET call_outcome = 'partial'    WHERE call_outcome = 'follow_up';
UPDATE public.calls SET call_outcome = 'not_closed' WHERE call_outcome = 'objection_unresolved';
UPDATE public.calls SET call_outcome = 'no_outcome' WHERE call_outcome = 'no_decision';

UPDATE public.calls SET detected_outcome = 'partial'    WHERE detected_outcome = 'follow_up';
UPDATE public.calls SET detected_outcome = 'not_closed' WHERE detected_outcome = 'objection_unresolved';
UPDATE public.calls SET detected_outcome = 'no_outcome' WHERE detected_outcome = 'no_decision';

-- ─── 5. ALTER COLUMN para o tipo ENUM ────────────────────────────────────────
-- Se já for ENUM (re-execução), o cast é no-op.
ALTER TABLE public.calls
  ALTER COLUMN call_outcome TYPE public.call_outcome_enum
  USING call_outcome::text::public.call_outcome_enum;

ALTER TABLE public.calls
  ALTER COLUMN detected_outcome TYPE public.call_outcome_enum
  USING detected_outcome::text::public.call_outcome_enum;


-- BEGIN: 023_rubric_sections_weight_critical.sql
-- Add weight and is_critical columns to criteria table
-- weight: integer (0–100), sum across rubric must equal 100
-- is_critical: boolean — score ≤ 4 on a critical section triggers red alert in email

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;

-- Seed weights and critical flags for the default rubric criteria
UPDATE public.criteria
SET weight = 20, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Discovery';

UPDATE public.criteria
SET weight = 25, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Problem Agitation';

UPDATE public.criteria
SET weight = 20, is_critical = false
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Offer Presentation';

UPDATE public.criteria
SET weight = 25, is_critical = true
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Objection Handling';

UPDATE public.criteria
SET weight = 10, is_critical = false
WHERE rubric_id = '00000000-0000-0000-0000-000000000001'
  AND name = 'Close & Next Steps';


-- BEGIN: 024_call_cost_tracking.sql
-- Migration: 024_call_cost_tracking
-- Purpose: Track LLM cost and prompt metadata per call.
--          Required by Task 1.2 (LLM Prompt Redesign) — toda call precisa
--          documentar o modelo usado, uso de tokens, custo em USD e versão
--          do prompt para que o ADMIN consiga atribuir gasto por org/call.
--          Decisão Lucas (2026-05-04): demo roda OpenAI-only, sem fallback
--          de provider (a comparação com Gemini foi descartada nesta fase).
--
-- Idempotente — pode rodar múltiplas vezes.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS model_used      TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens    INT,
  ADD COLUMN IF NOT EXISTS output_tokens   INT,
  ADD COLUMN IF NOT EXISTS cost_usd        NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS prompt_version  TEXT;

-- Sentinel for legacy rows so analytics queries can distinguish "v1 prompt
-- without cost tracking" from "v2 with NULL because the call failed mid-flight".
UPDATE public.calls
   SET prompt_version = 'v1'
 WHERE prompt_version IS NULL;

-- Rollback (manual):
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS model_used,
--   DROP COLUMN IF EXISTS input_tokens,
--   DROP COLUMN IF EXISTS output_tokens,
--   DROP COLUMN IF EXISTS cost_usd,
--   DROP COLUMN IF EXISTS prompt_version;


-- BEGIN: 025_ensure_sections_column.sql
-- Migration: 025_ensure_sections_column
-- Purpose: Garante a existência da coluna `calls.sections` (JSONB) usada
--          pelo Prompt v2 (Task 1.2). A migration original que cria essa
--          coluna está em `scripts/001_section_scores.sql`, mas o histórico
--          tem duplicatas de número (existem dois `001_*.sql`) e em alguns
--          ambientes ela não foi aplicada — o que quebra inserts do
--          /api/analyze com:
--            "Could not find the 'sections' column of 'calls' in the
--             schema cache".
--
--          Esta migration NÃO substitui 001_section_scores — só assegura
--          o ADD COLUMN. Se a coluna já existir (porque 001_section_scores
--          rodou antes), o `IF NOT EXISTS` torna o comando no-op.
--
--          Idempotente — pode rodar múltiplas vezes.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_sections
  ON public.calls USING GIN (sections);

-- Rollback (manual):
-- DROP INDEX IF EXISTS idx_calls_sections;
-- ALTER TABLE public.calls DROP COLUMN IF EXISTS sections;


-- BEGIN: 026_prompt_version_check.sql
-- Migration: 026_prompt_version_check
-- Purpose: Constrain `calls.prompt_version` to known values so the column
--          doesn't drift into wildcards (`v2-fixed`, `V2`, `prompt-v2`, …)
--          that break analytics and A/B reads. Whitelist is intentionally
--          tight — adding a new prompt version is a deliberate migration.
--
-- Idempotente — pode rodar múltiplas vezes.

DO $$
BEGIN
  -- O lookup precisa qualificar schema + tabela. conname não é único globalmente
  -- no Postgres — uma `calls_prompt_version_check` em outro schema faria o
  -- IF pular o ALTER e public.calls.prompt_version ficaria sem CHECK.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t      ON t.oid = c.conrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
     WHERE c.conname = 'calls_prompt_version_check'
       AND t.relname = 'calls'
       AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_prompt_version_check
      CHECK (prompt_version IS NULL OR prompt_version IN ('v1', 'v2'));
  END IF;
END $$;

-- Rollback (manual):
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_prompt_version_check;


-- BEGIN: 027_memberships_and_active_org.sql
-- ============================================================
-- 027_memberships_and_active_org.sql
-- Multi-org foundation:
--   - public.memberships (user_id × org_id × role × invite_status)
--   - users.active_org_id (org "selecionada" agora pelo user)
--   - current_org() — função SQL que lê active_org_id; vai
--     substituir auth.jwt()->>'org_id' nas RLS policies (na 028)
--
-- Admin global NÃO entra em memberships — admin é orthogonal a
-- org. JWT app_metadata.role='admin' continua sendo o sinal.
--
-- Idempotente: INSERT ... ON CONFLICT, UPDATE ... WHERE IS NULL,
-- IF NOT EXISTS, OR REPLACE. Pode re-rodar sem efeito colateral.
-- ============================================================

-- ─── 1. Tabela memberships ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.memberships (
  user_id        UUID NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'trainer')),
  invite_status  TEXT NOT NULL DEFAULT 'accepted'
                   CHECK (invite_status IN ('pending', 'accepted')),
  invited_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx       ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_org_id_idx        ON public.memberships(org_id);
CREATE INDEX IF NOT EXISTS memberships_invite_status_idx ON public.memberships(invite_status);

-- ─── 2. users.active_org_id ──────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_org_id UUID
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_org_id_idx ON public.users(active_org_id);

-- ─── 3. current_org() ────────────────────────────────────────────────────────
-- Lê users.active_org_id para o auth.uid() corrente.
-- SECURITY DEFINER: contorna RLS de users (a função é chamada por policies de
-- outras tabelas — precisa funcionar sem depender da policy de users).
-- STABLE: depende do estado da tabela mas é determinística dentro da query.

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT active_org_id FROM public.users WHERE id = auth.uid()
$$;

-- ─── 4. Backfill memberships a partir de users ───────────────────────────────
-- Cada user com role IN ('owner','trainer') e org_id definido vira uma
-- membership equivalente. Admin é ignorado (não pertence a org).

INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_by, invited_at)
SELECT
  u.id,
  u.org_id,
  u.role,
  COALESCE(u.invite_status, 'accepted'),
  u.invited_by,
  u.invited_at
FROM public.users u
WHERE u.role IN ('owner', 'trainer')
  AND u.org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ─── 5. Backfill users.active_org_id ─────────────────────────────────────────

UPDATE public.users
SET    active_org_id = org_id
WHERE  active_org_id IS NULL
  AND  org_id IS NOT NULL;

-- ─── 6. RLS em memberships ───────────────────────────────────────────────────

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_service_role_all" ON public.memberships;
CREATE POLICY "memberships_service_role_all" ON public.memberships
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- User vê apenas as próprias memberships (necessário pro org switcher).
-- Listagem de membros do time pra owner usa createAdminClient na API.
DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
CREATE POLICY "memberships_select_own" ON public.memberships
  FOR SELECT
  USING (user_id = auth.uid());


-- BEGIN: 028_swap_rls_to_current_org.sql
-- ============================================================
-- 028_swap_rls_to_current_org.sql
-- Swap das policies multi-tenant: deixa de ler
--   auth.jwt()->'app_metadata'->>'org_id'
-- e passa a chamar public.current_org() (definida em 027).
--
-- Adicionalmente, reforça current_org() pra exigir membership
-- ativa — assim, se alguém setar users.active_org_id pra uma org
-- que ele não pertence, current_org() devolve NULL e nenhuma RLS
-- libera linha (defesa em profundidade).
--
-- Tabelas tocadas: organizations, calls, rubrics, criteria,
-- scripts, insights. profiles/owners/clients usam outras políticas
-- (auth.uid = id, service_role only) e ficam intocados.
--
-- DROP IF EXISTS cobre os 2 nomes históricos (012 vs 015) — alguns
-- ambientes podem ter aplicado um dos dois. Idempotente.
-- ============================================================

-- ─── 1. current_org() endurecida — exige membership ativa ────────────────────

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.active_org_id
  FROM   public.users u
  WHERE  u.id = auth.uid()
    AND  EXISTS (
      SELECT 1
      FROM   public.memberships m
      WHERE  m.user_id       = u.id
        AND  m.org_id        = u.active_org_id
        AND  m.invite_status = 'accepted'
    )
$$;

-- ─── 2. organizations ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = public.current_org());

-- ─── 3. calls ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "calls_select_by_org" ON public.calls;
CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_insert_by_org" ON public.calls;
CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_update_by_org" ON public.calls;
CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING (org_id = public.current_org());

-- ─── 4. rubrics ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "rubrics_isolate_by_org" ON public.rubrics; -- 012 naming
DROP POLICY IF EXISTS "rubrics_select_by_org"  ON public.rubrics; -- 015 naming
CREATE POLICY "rubrics_select_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "rubrics_write_by_org" ON public.rubrics;
CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 5. criteria ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "criteria_isolate_by_org" ON public.criteria; -- 012 naming
DROP POLICY IF EXISTS "criteria_select_by_org"  ON public.criteria; -- 015 naming
CREATE POLICY "criteria_select_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "criteria_write_by_org" ON public.criteria;
CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 6. scripts ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "scripts_select_by_org" ON public.scripts;
CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "scripts_write_by_org" ON public.scripts;
CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING      (org_id = public.current_org())
  WITH CHECK (org_id = public.current_org());

-- ─── 7. insights ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "insights_select_by_org" ON public.insights;
CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = public.current_org());


-- BEGIN: 029_plan_limits.sql
-- ============================================================
-- 029_plan_limits.sql
-- Limites por plano (TC-10/TC-11). Adiciona max_calls_per_month
-- e atualiza max_sales_people nos 3 plans existentes:
--
--   starter : 5  seats / 200  calls/mês
--   pro     : 15 seats / 1000 calls/mês
--   pro_rag : NULL (ilimitado em ambos)
--
-- Convenção: NULL = ilimitado (consistente com max_sales_people
-- que já era NULL pra pro/pro_rag em 018). Gates de seats/calls
-- na app tratam NULL como bypass.
--
-- has_rag NÃO mexe — pro_rag já é true (018), starter/pro são
-- false. Confirmado pelo PO em 2026-05-05.
-- ============================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_calls_per_month INT;

COMMENT ON COLUMN public.plans.max_calls_per_month IS
  'Máximo de calls criadas por mês corrente para uma org neste plano. NULL = ilimitado.';

-- ─── Atualização dos 3 plans ─────────────────────────────────────────────────
-- ON CONFLICT em code garante que só atualiza linhas existentes (não cria).

UPDATE public.plans SET max_sales_people = 5,    max_calls_per_month = 200  WHERE code = 'starter';
UPDATE public.plans SET max_sales_people = 15,   max_calls_per_month = 1000 WHERE code = 'pro';
UPDATE public.plans SET max_sales_people = NULL, max_calls_per_month = NULL WHERE code = 'pro_rag';


-- BEGIN: 030_auth_helper_functions.sql
-- ============================================================
-- 030_auth_helper_functions.sql
-- Funções SQL chamadas via supabase.rpc() pelo lib/auth.ts.
-- Substituem 3-4 SELECTs separados (users → memberships →
-- organizations → clients → plans) por um único round trip.
--
-- Todas SECURITY DEFINER (precisam ler users + memberships sem
-- bater nas políticas RLS); STABLE (mesma input → mesma saída
-- dentro de uma transação).
-- ============================================================

-- ─── 1. get_user_org_context — bootstrap de auth por request ─────────────────
-- Retorna o estado completo da org ativa do user: org_id, role no membership,
-- e os campos do plano (code, has_rag, limites). NULL em qualquer campo
-- significa "não definido" (ex.: user sem active_org_id ainda, ou plano sem
-- limite ⇒ ilimitado).

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',      u.active_org_id,
    'role',             m.role,
    'planCode',         p.code,
    'hasRag',           COALESCE(p.has_rag, false),
    'maxSalesPeople',   p.max_sales_people,
    'maxCallsPerMonth', p.max_calls_per_month
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.clients       c ON c.id            = o.client_id
  LEFT JOIN  public.plans         p ON p.id            = c.plan_id
  WHERE      u.id = p_user_id
$$;

-- ─── 2. get_memberships_for_switcher — alimenta o seletor de org ─────────────
-- Lista todas as orgs onde o user tem membership aceita, com nome da org e
-- role naquela org. Ordenada por nome.

CREATE OR REPLACE FUNCTION public.get_memberships_for_switcher(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'orgId',   o.id,
        'orgName', o.name,
        'role',    m.role
      )
      ORDER BY o.name
    ),
    '[]'::jsonb
  )
  FROM      public.memberships   m
  JOIN      public.organizations o ON o.id = m.org_id
  WHERE     m.user_id       = p_user_id
    AND     m.invite_status = 'accepted'
$$;


-- BEGIN: 031_relax_trainer_owner_uniqueness.sql
-- ============================================================
-- 031_relax_trainer_owner_uniqueness.sql
-- Permite multi-org em trainers e owners.
--
-- - trainers: já tinha org_id (015). UNIQUE(user_id) → UNIQUE(user_id, org_id).
-- - owners: NÃO tinha org_id. Adicionar coluna + backfill via users.org_id.
--   UNIQUE(user_id) → UNIQUE(user_id, org_id).
--
-- Idempotente — checks de pg_constraint antes de DROP/ADD.
-- ============================================================

-- ─── 1. trainers: UNIQUE(user_id) → UNIQUE(user_id, org_id) ──────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_id_key') THEN
    ALTER TABLE public.trainers DROP CONSTRAINT trainers_user_id_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_user_org_key') THEN
    ALTER TABLE public.trainers ADD CONSTRAINT trainers_user_org_key UNIQUE (user_id, org_id);
  END IF;
END $$;

-- ─── 2. owners: ADD org_id + backfill ────────────────────────────────────────

ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS owners_org_id_idx ON public.owners(org_id);

-- Backfill via users.org_id (ainda presente como coluna denormalizada). Cada
-- owner row hoje tem 1:1 com user → 1:1 com org, então o backfill é seguro.
UPDATE public.owners o
SET    org_id = u.org_id
FROM   public.users u
WHERE  u.id = o.user_id
  AND  o.org_id IS NULL
  AND  u.org_id IS NOT NULL;

-- ─── 3. owners: UNIQUE(user_id) → UNIQUE(user_id, org_id) ────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_user_id_key') THEN
    ALTER TABLE public.owners DROP CONSTRAINT owners_user_id_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'owners_user_org_key') THEN
    ALTER TABLE public.owners ADD CONSTRAINT owners_user_org_key UNIQUE (user_id, org_id);
  END IF;
END $$;


-- BEGIN: 032_harden_security_and_atomic_limits.sql
-- ============================================================
-- 032_harden_security_and_atomic_limits.sql
--
-- Cobre 4 issues levantados em code review:
--
-- 1) RPCs `get_user_org_context(uuid)` e `get_memberships_for_switcher(uuid)`
--    eram SECURITY DEFINER e aceitavam UUID arbitrário, sem REVOKE.
--    Qualquer user autenticado podia chamar com outro user_id e obter
--    org/role/plano alheios. Solução: REVOKE EXECUTE de PUBLIC/anon/
--    authenticated; só service_role chama (lib/auth.ts usa createAdminClient).
--
-- 2) Gate de seats em /api/invites era count + insert separados — race
--    permitia 2 convites concorrentes passarem na mesma vaga. Trigger
--    BEFORE INSERT em memberships com pg_advisory_xact_lock fecha o gap.
--
-- 3) Mesmo problema em calls (TC-10). Trigger BEFORE INSERT em calls.
--
-- 4) Defesa em profundidade — mesmo se a app esquecer o pre-check, o
--    DB rejeita.
-- ============================================================

-- ─── 1. Lockdown das RPCs (sem mudar assinatura) ─────────────────────────────

REVOKE EXECUTE ON FUNCTION public.get_user_org_context(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_memberships_for_switcher(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_org_context(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.get_memberships_for_switcher(uuid) TO service_role;

-- ─── 2. Trigger atômico de seat limit em memberships ─────────────────────────
-- Roda em BEFORE INSERT. pg_advisory_xact_lock(hashtext('seats:'||org_id))
-- serializa inserts concorrentes pra mesma org. Lock dura até o fim da
-- transação corrente — se 2 inserts disputarem a última vaga, um espera o
-- outro e relê a contagem antes de decidir.

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
BEGIN
  -- Só conta seats pra trainers. Owners não consomem (decisão de produto).
  IF NEW.role = 'trainer' AND NEW.invite_status IN ('pending', 'accepted') THEN
    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.org_id::text));

    SELECT p.max_sales_people
    INTO   v_max
    FROM   public.organizations o
    JOIN   public.clients       c ON c.id = o.client_id
    JOIN   public.plans         p ON p.id = c.plan_id
    WHERE  o.id = NEW.org_id;

    -- NULL = ilimitado (Pro+RAG). Skip.
    IF v_max IS NOT NULL THEN
      SELECT count(*)
      INTO   v_count
      FROM   public.memberships
      WHERE  org_id        = NEW.org_id
        AND  role          = 'trainer'
        AND  invite_status IN ('pending', 'accepted');

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'PLAN_LIMIT_SEATS: org % at trainer cap (% / %)',
          NEW.org_id, v_count, v_max
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_enforce_seat_limit ON public.memberships;
CREATE TRIGGER memberships_enforce_seat_limit
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_limit();

-- ─── 3. Trigger atômico de calls/mês limit em calls ──────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_call_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
  v_start TIMESTAMPTZ;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW; -- calls antigas sem org (legado pré-012) não são gateadas
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('calls:' || NEW.org_id::text));

  SELECT p.max_calls_per_month
  INTO   v_max
  FROM   public.organizations o
  JOIN   public.clients       c ON c.id = o.client_id
  JOIN   public.plans         p ON p.id = c.plan_id
  WHERE  o.id = NEW.org_id;

  IF v_max IS NOT NULL THEN
    v_start := date_trunc('month', now());
    SELECT count(*)
    INTO   v_count
    FROM   public.calls
    WHERE  org_id     = NEW.org_id
      AND  created_at >= v_start;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_CALLS: org % at monthly cap (% / %)',
        NEW.org_id, v_count, v_max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_enforce_limit ON public.calls;
CREATE TRIGGER calls_enforce_limit
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_call_limit();


-- BEGIN: 033_overall_score_numeric.sql
-- ============================================================
-- 033_overall_score_numeric.sql
--
-- Problema: calls.overall_score estava como INT (criado em
-- 003_create_calls_table.sql), mas o cálculo em /api/analyze
-- (Math.round(avg * 10) / 10) produz um decimal de 1 casa em
-- [0.0, 5.0] (ex.: 4.6, 3.9). Isso fazia o INSERT estourar com
-- "invalid input syntax for type integer: \"4.6\"".
--
-- Solução: converter overall_score para NUMERIC(3,1). O cast de
-- INT → NUMERIC(3,1) é seguro para os valores existentes (que
-- estavam todos no range 0–5 mesmo armazenados como int).
-- ============================================================

ALTER TABLE public.calls
  ALTER COLUMN overall_score TYPE NUMERIC(3,1) USING overall_score::numeric;


-- BEGIN: 034_invite_tokens.sql
-- ============================================================
-- 034_invite_tokens.sql
--
-- Tokens de convite próprios, por (user_id, org_id) — um token por
-- membership. Hoje (até 033) o link de convite usa o token do auth
-- do Supabase, que é por user (email): em multi-org, reenviar invite
-- pra org B invalida o link que ainda estava válido pra org A do
-- mesmo email. Esta tabela move a fonte de verdade do token pra
-- application-side, isolando o ciclo de vida por membership:
--
--   - Reenvio em (user, org_B) só invalida o token de (user, org_B);
--     o token de (user, org_A) segue ativo até clicar/expirar/revogar.
--   - Auditável: cada (re)envio gera uma linha; histórico fica.
--   - Revoke da membership cascateia (FK).
--
-- O cleartext do token nunca é persistido — só vai no email. Aqui
-- guardamos apenas SHA-256 (`token_hash`). Lookup no callback é por
-- hash do que o cliente apresentou.
--
-- Lockdown total: RLS habilitado, sem policies pra anon/authenticated.
-- O fluxo de invite/callback roda via service_role (createAdminClient
-- em /lib/supabase/admin.ts).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DO $$ … END $$ pra grants.
-- ============================================================

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  org_id          UUID NOT NULL,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  invalidated_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  -- FK composta pra memberships: revogar a membership (DELETE) limpa
  -- automaticamente os tokens dela. Sem isso, sobraria token órfão
  -- apontando pra (user, org) que não existe mais.
  FOREIGN KEY (user_id, org_id)
    REFERENCES public.memberships(user_id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON DELETE SET NULL,
  -- Defesa em profundidade: rejeita estados impossíveis (consumido E invalidado).
  CONSTRAINT invite_tokens_lifecycle_chk CHECK (
    NOT (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
  )
);

-- ─── 2. Índices ──────────────────────────────────────────────────────────────

-- Lookup principal: callback recebe o token, busca por hash.
-- UNIQUE pra evitar colisão de hash (probabilidade desprezível em SHA-256,
-- mas o constraint protege contra bug de geração que reuse seed).
CREATE UNIQUE INDEX IF NOT EXISTS invite_tokens_token_hash_uidx
  ON public.invite_tokens(token_hash);

-- Garante que existe no máximo 1 token "vivo" (não consumido, não invalidado)
-- por (user, org). Reenviar invalida o anterior antes de inserir o novo —
-- esta partial unique fecha race se 2 reenvios concorrerem pra mesma membership.
CREATE UNIQUE INDEX IF NOT EXISTS invite_tokens_active_per_membership_uidx
  ON public.invite_tokens(user_id, org_id)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Filtros operacionais comuns:
--   - listar tokens por user (todos os convites pendentes daquele user)
--   - cleanup job: SELECT … WHERE expires_at < now() AND consumed_at IS NULL
CREATE INDEX IF NOT EXISTS invite_tokens_user_id_idx
  ON public.invite_tokens(user_id);

CREATE INDEX IF NOT EXISTS invite_tokens_expires_at_idx
  ON public.invite_tokens(expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- ─── 3. RLS — lockdown total ─────────────────────────────────────────────────
-- Token hashes não devem ser legíveis pelo cliente em hipótese nenhuma.
-- Habilitamos RLS sem policies pra anon/authenticated; só service_role
-- (BYPASSRLS) acessa via createAdminClient. Mesmo padrão das funções
-- protegidas em 032.

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- FORCE garante que até o owner da tabela respeita RLS — defesa contra
-- mudanças futuras de role (ex.: alguém setando authenticated como owner).
ALTER TABLE public.invite_tokens FORCE ROW LEVEL SECURITY;

-- Revoga grants implícitos. Por padrão, CREATE TABLE em public dá SELECT
-- pra PUBLIC dependendo da config — fechamos explicitamente.
REVOKE ALL ON public.invite_tokens FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.invite_tokens TO   service_role;

-- ─── 4. Helper: invalida tokens ativos de uma membership ────────────────────
-- Usado pelo POST /api/invites/[id]/resend ANTES de inserir o token novo.
-- Atomic + idempotente: marca invalidated_at em todos os ativos da membership.
-- Retorna a contagem invalidada (pra log/telemetria, opcional).
--
-- SECURITY DEFINER pra rodar com privilégios da função (que é dona
-- service_role), permitindo que o caller (mesmo via admin client) não
-- precise se preocupar com RLS context.

CREATE OR REPLACE FUNCTION public.invalidate_active_invite_tokens(
  p_user_id UUID,
  p_org_id  UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.invite_tokens
     SET invalidated_at = now()
   WHERE user_id = p_user_id
     AND org_id  = p_org_id
     AND consumed_at    IS NULL
     AND invalidated_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invalidate_active_invite_tokens(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.invalidate_active_invite_tokens(uuid, uuid)
  TO   service_role;

-- ─── 5. Helper: consome um token e devolve a membership ─────────────────────
-- Atomic: na mesma query marca consumed_at e devolve (user_id, org_id) se
-- o token estava válido (não expirado, não consumido, não invalidado).
-- Se já estava consumido/expirado/invalidado, devolve linha vazia.
--
-- Usado pelo callback /api/auth/verify-invite-token. Garante que o token
-- é one-shot: dois clicks concorrentes — só um ganha.

CREATE OR REPLACE FUNCTION public.consume_invite_token(
  p_token_hash TEXT
)
RETURNS TABLE(user_id UUID, org_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.invite_tokens
     SET consumed_at = now()
   WHERE token_hash = p_token_hash
     AND consumed_at    IS NULL
     AND invalidated_at IS NULL
     AND expires_at     > now()
  RETURNING user_id, org_id;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_invite_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_invite_token(text)
  TO   service_role;

-- ─── 6. Comentários (documentação inline pro psql/pgAdmin) ──────────────────

COMMENT ON TABLE  public.invite_tokens IS
  'Tokens de convite per-membership. Substitui o token-por-user do Supabase Auth no fluxo de convite — permite reenvio isolado por org sem invalidar links de outras orgs do mesmo user.';

COMMENT ON COLUMN public.invite_tokens.token_hash IS
  'SHA-256 hex do token cleartext. O cleartext só circula no email; nunca é persistido.';

COMMENT ON COLUMN public.invite_tokens.consumed_at IS
  'Timestamp do clique no link válido. NULL = não usado. Set por consume_invite_token().';

COMMENT ON COLUMN public.invite_tokens.invalidated_at IS
  'Timestamp da invalidação por reenvio. NULL = ativo. Set por invalidate_active_invite_tokens() antes de gerar token novo.';


-- BEGIN: 035_drop_criteria_columns.sql
-- Migration 035: Drop legacy criteria columns from calls table
--
-- Background: Task 1.1 introduced the `sections` column (array of
-- {name, score, feedback, critical, weight}) as the canonical format.
-- The `criteria` and `total_criteria` columns duplicated the same data
-- in the old format (without the `critical` flag). All application code
-- has been migrated to read/write `sections` only.
--
-- Run once on every environment (dev, staging, prod) after deploying
-- the application code that removes all `criteria` reads and writes.

ALTER TABLE calls
  DROP COLUMN IF EXISTS criteria,
  DROP COLUMN IF EXISTS total_criteria;


-- BEGIN: 036_ml_fields.sql
-- ============================================================
-- 036_ml_fields.sql
--
-- Adiciona campos necessários para o pipeline de correlação ML
-- (User Story: Data Scientist — schema para modelo de correlação).
--
-- Campos adicionados em calls:
--   closed           BOOLEAN  — resultado binário da call (true = fechou)
--                               derivado de call_outcome, mas explícito para
--                               facilitar queries de ML sem JOIN/CASE
--   call_date        DATE     — data em que a call aconteceu (≠ created_at,
--                               que é a data do upload)
--   duration_seconds INT      — duração da call em segundos
--
-- View adicionada:
--   calls_ml_flat    — desnormaliza calls.sections JSONB em colunas escalares
--                      para consumo direto pelo pipeline sem parsing JSON
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Campo closed (boolean binário para ML) ────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS closed BOOLEAN;

-- Backfill: derivar closed a partir de call_outcome existente
UPDATE public.calls
SET closed = (call_outcome = 'closed')
WHERE closed IS NULL
  AND call_outcome IS NOT NULL;

-- Index para filtros rápidos de ML
CREATE INDEX IF NOT EXISTS calls_closed_idx ON public.calls(closed);
CREATE INDEX IF NOT EXISTS calls_closed_org_idx ON public.calls(org_id, closed);

-- ─── 2. call_date (data da call, separada do upload) ─────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS call_date DATE;

-- Backfill: para calls legadas, assumir que call_date = data do upload
UPDATE public.calls
SET call_date = created_at::date
WHERE call_date IS NULL;

CREATE INDEX IF NOT EXISTS calls_call_date_idx ON public.calls(call_date DESC);

-- ─── 3. duration_seconds (duração da call) ────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS duration_seconds INT;

-- Sem backfill — calls legadas ficam NULL (dado não disponível)

-- ─── 4. View calls_ml_flat — desnormaliza sections JSONB ──────────────────────
--
-- Transforma o array sections em colunas escalares por dimensão:
--   score_discovery, score_problem_agitation, score_offer_presentation,
--   score_objection_handling, score_close_next_steps
--
-- Dimensões são extraídas por nome (case-insensitive) para tolerar
-- variações de capitalização entre versões do prompt.
--
-- A view é SECURITY DEFINER-free e respeita RLS da tabela base (calls).

CREATE OR REPLACE VIEW public.calls_ml_flat AS
SELECT
  c.id,
  c.org_id,
  c.trainer_id,
  c.trainer_name,
  c.trainer_email,
  c.call_date,
  c.created_at                                      AS uploaded_at,
  c.duration_seconds,
  c.overall_score,
  c.closed,
  c.call_outcome,
  c.detected_outcome,
  c.model_used,
  c.prompt_version,
  c.cost_usd,

  -- Scores por seção (extraídos do JSONB sections[])
  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%discovery%'
    LIMIT 1
  )                                                 AS score_discovery,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%problem%'
    LIMIT 1
  )                                                 AS score_problem_agitation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%offer%'
       OR lower(elem->>'name') LIKE '%presentation%'
    LIMIT 1
  )                                                 AS score_offer_presentation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%objection%'
    LIMIT 1
  )                                                 AS score_objection_handling,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%close%'
       OR lower(elem->>'name') LIKE '%next%'
    LIMIT 1
  )                                                 AS score_close_next_steps

FROM public.calls c
WHERE c.sections IS NOT NULL;

COMMENT ON VIEW public.calls_ml_flat IS
  'Desnormalização de calls para pipeline ML. '
  'Cada linha = 1 call com scores por dimensão em colunas escalares. '
  'Respeita RLS da tabela calls. '
  'Calls sem sections (legadas) são excluídas.';

-- ─── 5. Trigger: manter closed sincronizado com call_outcome ─────────────────

CREATE OR REPLACE FUNCTION public.sync_closed_from_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.closed := (NEW.call_outcome = 'closed');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_closed ON public.calls;
CREATE TRIGGER trg_sync_closed
  BEFORE INSERT OR UPDATE OF call_outcome ON public.calls
  FOR EACH ROW
  WHEN (NEW.call_outcome IS NOT NULL)
  EXECUTE FUNCTION public.sync_closed_from_outcome();

-- Rollback (manual):
-- DROP TRIGGER IF EXISTS trg_sync_closed ON public.calls;
-- DROP FUNCTION IF EXISTS public.sync_closed_from_outcome();
-- DROP VIEW IF EXISTS public.calls_ml_flat;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS closed,
--   DROP COLUMN IF EXISTS call_date,
--   DROP COLUMN IF EXISTS duration_seconds;


-- BEGIN: 037_marketing_runs.sql
-- ============================================================
-- 037_marketing_runs.sql
--
-- Cria a tabela que armazena cada execução do módulo Marketing
-- Intelligence — uma rodada gera headlines + primary texts a partir
-- de 3–5 calls fechadas, e o resultado é persistido para evitar
-- chamar o LLM em toda pageview.
--
-- Fluxo:
--   - GET /api/marketing-intelligence — devolve a última run; se >7d
--     ou inexistente, dispara nova run automática (trigger='auto').
--   - POST /api/marketing-intelligence/run — admin força nova run
--     manual (trigger='manual').
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.marketing_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_call_ids UUID[] NOT NULL,
  headlines       JSONB NOT NULL,
  primary_texts   JSONB NOT NULL,
  model_used      TEXT,
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10,6),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger         TEXT NOT NULL DEFAULT 'manual'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_runs_trigger_check'
  ) THEN
    ALTER TABLE public.marketing_runs
      ADD CONSTRAINT marketing_runs_trigger_check
      CHECK (trigger IN ('auto', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS marketing_runs_org_ran_idx
  ON public.marketing_runs(org_id, ran_at DESC);

ALTER TABLE public.marketing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_runs_select_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_select_by_org" ON public.marketing_runs
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org());

COMMENT ON TABLE public.marketing_runs IS
  'Cada linha = 1 execução do módulo Marketing Intelligence. '
  'Armazena o sample de calls fechadas usadas, o copy gerado e o custo do LLM. '
  'GET /api/marketing-intelligence consulta a última run da org.';

-- Rollback (manual):
-- DROP TABLE IF EXISTS public.marketing_runs;


-- BEGIN: 038_subscription_status.sql
-- ============================================================
-- 037_subscription_status.sql
-- Adiciona clients.subscription_status pra suportar self-service
-- onboarding: Owner cria org com sub 'inactive' (sem plano efetivo),
-- vira 'active' após checkout (Stripe ou stub). Plan gate frontend
-- usa esse campo pra renderizar UpsellBadge/FeatureGate; backend
-- usa em requireActiveSubscription() pra retornar 402.
--
-- Padrão TEXT + CHECK seguindo o resto do schema (027, 020, 013, 018)
-- em vez de ENUM real — facilita evoluir valores no futuro
-- (ex.: 'trialing', 'past_due', 'canceled') sem ALTER TYPE.
-- ============================================================

-- ─── 1. Coluna em clients ────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active'));

CREATE INDEX IF NOT EXISTS clients_subscription_status_idx
  ON public.clients(subscription_status);

-- ─── 2. Backfill: orgs existentes (criadas via Admin) viram 'active' ─────────
-- Premissa: tudo que já está no banco hoje é cliente real criado por Admin,
-- portanto considerado ativo. O caminho self-service (nova rota
-- /api/onboarding/organization) é o único que cria com 'inactive' daqui em
-- diante. Só backfilla quem tem plan_id — sem plano não existe sub ativa.

UPDATE public.clients
SET    subscription_status = 'active'
WHERE  plan_id IS NOT NULL
  AND  subscription_status = 'inactive';

-- ─── 3. Atualizar get_user_org_context pra retornar subscriptionStatus ───────
-- lib/auth.ts ActiveOrgContext ganha o campo correspondente. COALESCE garante
-- que user sem org ativa (ainda em onboarding) recebe 'inactive' — UI trata
-- igual ao caso "tem org mas não pagou".

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',        u.active_org_id,
    'role',               m.role,
    'planCode',           p.code,
    'hasRag',             COALESCE(p.has_rag, false),
    'maxSalesPeople',     p.max_sales_people,
    'maxCallsPerMonth',   p.max_calls_per_month,
    'subscriptionStatus', COALESCE(c.subscription_status, 'inactive')
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.clients       c ON c.id            = o.client_id
  LEFT JOIN  public.plans         p ON p.id            = c.plan_id
  WHERE      u.id = p_user_id
$$;


-- BEGIN: 039_merge_clients_into_organizations.sql
-- ============================================================
-- 038_merge_clients_into_organizations.sql
-- Mescla clients dentro de organizations. Conceitualmente os dois
-- representam a mesma entidade (1:1 mirror via app code) — manter
-- separados gerava risco de drift e queries com JOIN desnecessário.
-- A pedido do Vitor pra simplificar o modelo antes que mais código
-- dependa da divisão.
--
-- Mudanças:
--   1. organizations ganha: plan_id, subscription_status, health,
--      mrr, calls_this_month, avg_score, trainers_count
--   2. Backfill: cada org puxa os valores do client espelho
--   3. RPC get_user_org_context atualizada — JOIN direto via plans
--   4. Trigger functions enforce_seat_limit() e enforce_call_limit()
--      reescritas pra ler de organizations.plan_id (antes liam via
--      organizations → clients → plans, JOIN quebraria pós-drop)
--   5. organizations.client_id (FK reverso) é dropado
--   6. clients table inteira é dropada (CASCADE limpa policy/indexes)
--
-- Code refactor associado nesta mesma commit (lib/db/clients.ts,
-- api/organizations, api/invites, api/onboarding/*) — sem isso, queries
-- antigas quebram quando a tabela some.
-- ============================================================

-- ─── 1. Colunas novas em organizations ───────────────────────────────────────
-- Defaults conservadores: orgs sem mirror anterior (caso raro de seed
-- inconsistente) caem em 'inactive' + 'healthy' + zeros, mesmo comportamento
-- da self-service onboarding pré-pagamento.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_id             UUID REFERENCES public.plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'
                              CHECK (subscription_status IN ('inactive', 'active')),
  ADD COLUMN IF NOT EXISTS health              TEXT NOT NULL DEFAULT 'healthy'
                              CHECK (health IN ('healthy', 'at-risk', 'churning')),
  ADD COLUMN IF NOT EXISTS mrr                 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_this_month    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_score           INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trainers_count      INT DEFAULT 0;

-- ─── 2. Backfill: copia tudo do client espelho pra organizations ────────────
-- Guard pra idempotência: se a migration já rodou em outro ambiente e a
-- tabela clients já não existe, pula o backfill (UPDATE referenciaria
-- tabela inexistente e erraria). Re-rodadas viram no-op seguro.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) THEN
    UPDATE public.organizations o
    SET
      plan_id             = c.plan_id,
      subscription_status = c.subscription_status,
      health              = c.health,
      mrr                 = c.mrr,
      calls_this_month    = c.calls_this_month,
      avg_score           = c.avg_score,
      trainers_count      = c.trainers_count
    FROM public.clients c
    WHERE c.org_id = o.id;
  END IF;
END $$;

-- ─── 3. Índices novos no organizations ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS organizations_plan_id_idx
  ON public.organizations(plan_id);

CREATE INDEX IF NOT EXISTS organizations_subscription_status_idx
  ON public.organizations(subscription_status);

-- ─── 4. RPC get_user_org_context — JOIN direto em organizations ─────────────
-- Antes a função fazia users → memberships → organizations → clients → plans.
-- Agora: users → memberships → organizations → plans. Um LEFT JOIN a menos.

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',        u.active_org_id,
    'role',               m.role,
    'planCode',           p.code,
    'hasRag',             COALESCE(p.has_rag, false),
    'maxSalesPeople',     p.max_sales_people,
    'maxCallsPerMonth',   p.max_calls_per_month,
    'subscriptionStatus', COALESCE(o.subscription_status, 'inactive')
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.plans         p ON p.id            = o.plan_id
  WHERE      u.id = p_user_id
$$;

-- ─── 5. Recriar trigger functions que liam plano via clients ────────────────
-- Migration 032 criou enforce_seat_limit() e enforce_call_limit() com JOIN
-- via clients (organizations → clients → plans). Pós-merge esses triggers
-- referenciam tabela que vai sumir no step 7 — qualquer INSERT em
-- memberships ou calls quebra com `relation "public.clients" does not exist`.
-- Reescritas aqui pra LER direto de organizations.plan_id.

CREATE OR REPLACE FUNCTION public.enforce_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
BEGIN
  IF NEW.role = 'trainer' AND NEW.invite_status IN ('pending', 'accepted') THEN
    PERFORM pg_advisory_xact_lock(hashtext('seats:' || NEW.org_id::text));

    SELECT p.max_sales_people
    INTO   v_max
    FROM   public.organizations o
    JOIN   public.plans         p ON p.id = o.plan_id
    WHERE  o.id = NEW.org_id;

    IF v_max IS NOT NULL THEN
      SELECT count(*)
      INTO   v_count
      FROM   public.memberships
      WHERE  org_id        = NEW.org_id
        AND  role          = 'trainer'
        AND  invite_status IN ('pending', 'accepted');

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'PLAN_LIMIT_SEATS: org % at trainer cap (% / %)',
          NEW.org_id, v_count, v_max
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_call_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   INT;
  v_count INT;
  v_start TIMESTAMPTZ;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('calls:' || NEW.org_id::text));

  SELECT p.max_calls_per_month
  INTO   v_max
  FROM   public.organizations o
  JOIN   public.plans         p ON p.id = o.plan_id
  WHERE  o.id = NEW.org_id;

  IF v_max IS NOT NULL THEN
    v_start := date_trunc('month', now());
    SELECT count(*)
    INTO   v_count
    FROM   public.calls
    WHERE  org_id     = NEW.org_id
      AND  created_at >= v_start;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_CALLS: org % at monthly cap (% / %)',
        NEW.org_id, v_count, v_max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 6. Drop FK organizations.client_id ─────────────────────────────────────
-- Nome do constraint segue o padrão {table}_{column}_fkey do Postgres autogen.
-- IF EXISTS evita erro caso o nome divergir em algum ambiente.

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_client_id_fkey;

DROP INDEX IF EXISTS organizations_client_id_idx;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS client_id;

-- ─── 7. Drop tabela clients ─────────────────────────────────────────────────
-- CASCADE limpa RLS policy "clients_service_role_all", índices
-- (clients_plan_id_idx, clients_org_id_idx, clients_subscription_status_idx)
-- e qualquer outra dependência residual em uma operação.

DROP TABLE IF EXISTS public.clients CASCADE;


-- BEGIN: 040_multi_tenant_complete.sql
-- ============================================================
-- 040_multi_tenant_complete.sql
-- Consolida 040+041+042+043+044+045 (rodada de 2026-05-13) num único
-- script idempotente. Cobre tudo que a feature de multi-tenant infra +
-- Admin impersonate precisou:
--
--   1. Subscription state expandido: 'trial' + trial_ends_at + admin_override
--   2. current_org() — versão final, sem ciclo via memberships
--      - Suporta impersonate read-only via JWT app_metadata.impersonating_org_id
--      - Confia em users.active_org_id (validação no API, /api/me/active-org)
--   3. current_org_for_write() — estrita, ignora impersonate
--      - Usada em WITH CHECK / FOR INSERT|UPDATE|DELETE
--      - Garante read-only pra Admin impersonando no nível DB
--      - Caveat: lib/db/*.ts usa service_role e bypassa RLS — a defesa real
--        é requireOwnerWrite() no API. Isso aqui é defense-in-depth.
--   4. RLS habilitado em users + trainers (não tinham antes)
--   5. Policies completas em todas tabelas tenant: SELECT por org,
--      mutations bloqueadas pra impersonate
--   6. Trial 'on-read': get_user_org_context flippa pra 'inactive' quando
--      trial_ends_at passou. Cron em 046 limpa o estado físico também.
--   7. admin_impersonations table com lockdown (FORCE RLS, service_role only)
--   8. Limpeza de policies legadas "tabela: admin read all" que tinham
--      self-subquery em users — causa do erro 42P17 (infinite recursion).
--
-- Idempotente: pode rodar várias vezes, em DB virgem ou em DB que já
-- aplicou as migrations 040-045 individualmente.
-- ============================================================

-- ─── PARTE 1: Subscription state expandido ──────────────────────────────────

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'trial'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_override BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS organizations_trial_ends_at_idx
  ON public.organizations(trial_ends_at)
  WHERE subscription_status = 'trial';

COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'Quando o trial vira inactive automaticamente. get_user_org_context flippa o status on-read; cron job em 046 também limpa o estado físico. NULL = sem trial ativo.';

COMMENT ON COLUMN public.organizations.admin_override IS
  'true = Admin setou subscription_status manualmente (trial/active/inactive). Stripe webhook futuro deve respeitar e não sobrescrever.';

-- ─── PARTE 2: Limpeza de policies legadas ───────────────────────────────────
-- As policies abaixo são do setup anterior ao multi-tenant. Padrão
-- "tabela: admin read all" com USING (EXISTS SELECT 1 FROM users WHERE
-- u.role='admin') causava recursão infinita quando aplicada em users.
-- Drop antes de criar as novas pra evitar conflito de nome/comportamento.

DROP POLICY IF EXISTS "users: admin read all"    ON public.users;
DROP POLICY IF EXISTS "users: own row"           ON public.users;
DROP POLICY IF EXISTS "trainers: admin read all" ON public.trainers;
DROP POLICY IF EXISTS "owners: admin read all"   ON public.owners;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'admins' AND c.relkind = 'r'
  ) THEN
    DROP POLICY IF EXISTS "admins: admin read all" ON public.admins;
  END IF;
END $$;

-- ─── PARTE 3: Funções current_org() — versão final ──────────────────────────
-- Drop com CASCADE pra limpar policies dependentes; recriadas na PARTE 6.
-- Função final NÃO faz EXISTS em memberships (era a fonte do ciclo).
-- Confiamos que users.active_org_id é consistente: /api/me/active-org valida
-- membership ANTES de gravar, e trigger em 046 limpa active_org_id quando
-- membership é deletada.

DROP FUNCTION IF EXISTS public.current_org()           CASCADE;
DROP FUNCTION IF EXISTS public.current_org_for_write() CASCADE;

CREATE FUNCTION public.current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
     AND (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id') IS NOT NULL
    THEN (auth.jwt() -> 'app_metadata' ->> 'impersonating_org_id')::uuid
    ELSE (
      SELECT u.active_org_id
      FROM public.users u
      WHERE u.id = auth.uid()
    )
  END
$$;

CREATE FUNCTION public.current_org_for_write()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.active_org_id
  FROM public.users u
  WHERE u.id = auth.uid()
$$;

COMMENT ON FUNCTION public.current_org() IS
  'Org ativa do user. Admin com app_metadata.impersonating_org_id retorna essa org (read-only — use current_org_for_write pra mutations). Caminho normal: users.active_org_id sem re-checagem de membership (validação no API write).';

COMMENT ON FUNCTION public.current_org_for_write() IS
  'Versão estrita — ignora impersonate. Bloqueia writes de Admin impersonando no DB level (defense-in-depth; defesa real é requireOwnerWrite no API).';

REVOKE EXECUTE ON FUNCTION public.current_org()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_org_for_write() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_org()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.current_org_for_write() TO authenticated, service_role;

-- ─── PARTE 4: get_user_org_context com sub 'trial' on-read ──────────────────
-- Quando subscription_status='trial' e trial_ends_at já passou, devolve
-- 'inactive' pro caller (lib/auth.ts:requireActiveSubscription bloqueia).
-- Estado físico no DB ainda é 'trial' — cron em 046 limpa.

CREATE OR REPLACE FUNCTION public.get_user_org_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'activeOrgId',        u.active_org_id,
    'role',               m.role,
    'planCode',           p.code,
    'hasRag',             COALESCE(p.has_rag, false),
    'maxSalesPeople',     p.max_sales_people,
    'maxCallsPerMonth',   p.max_calls_per_month,
    'subscriptionStatus',
      CASE
        WHEN o.subscription_status = 'trial'
         AND o.trial_ends_at IS NOT NULL
         AND o.trial_ends_at < now()
        THEN 'inactive'
        ELSE COALESCE(o.subscription_status, 'inactive')
      END,
    'trialEndsAt',        o.trial_ends_at
  )
  FROM       public.users         u
  LEFT JOIN  public.memberships   m ON m.user_id       = u.id
                                   AND m.org_id        = u.active_org_id
                                   AND m.invite_status = 'accepted'
  LEFT JOIN  public.organizations o ON o.id            = u.active_org_id
  LEFT JOIN  public.plans         p ON p.id            = o.plan_id
  WHERE      u.id = p_user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_org_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_org_context(uuid) TO   service_role;

-- ─── PARTE 5: RLS habilitado em users e trainers ────────────────────────────

ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;

-- ─── PARTE 6: Policies — users ──────────────────────────────────────────────
-- 2 policies apenas: service_role bypass + select_self. Cross-org user
-- listing fica via service_role no app code (lib/db/*.ts). NÃO criamos
-- users_select_same_org porque a subquery em memberships criava ciclo
-- via current_org() lendo users.

DROP POLICY IF EXISTS "users_service_role_all" ON public.users;
DROP POLICY IF EXISTS "users_select_self"      ON public.users;
DROP POLICY IF EXISTS "users_select_same_org"  ON public.users;

CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "users_select_self" ON public.users
  FOR SELECT
  USING (id = auth.uid());

-- ─── PARTE 7: Policies — trainers ───────────────────────────────────────────

DROP POLICY IF EXISTS "trainers_service_role_all" ON public.trainers;
DROP POLICY IF EXISTS "trainers_select_by_org"    ON public.trainers;

CREATE POLICY "trainers_service_role_all" ON public.trainers
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "trainers_select_by_org" ON public.trainers
  FOR SELECT
  USING (org_id = public.current_org());

-- ─── PARTE 8: Policies — organizations / memberships ────────────────────────

DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT
  USING (id = public.current_org());

-- memberships mantém só select_own (do 027). Não criamos select_by_org
-- pra evitar qualquer chance residual de ciclo via current_org → memberships.
DROP POLICY IF EXISTS "memberships_select_by_org" ON public.memberships;

-- ─── PARTE 9: Policies — tenant data (calls, rubrics, criteria, scripts) ────

-- calls
DROP POLICY IF EXISTS "calls_select_by_org" ON public.calls;
CREATE POLICY "calls_select_by_org" ON public.calls
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "calls_insert_by_org" ON public.calls;
CREATE POLICY "calls_insert_by_org" ON public.calls
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "calls_update_by_org" ON public.calls;
CREATE POLICY "calls_update_by_org" ON public.calls
  FOR UPDATE
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "calls_delete_by_org" ON public.calls;
CREATE POLICY "calls_delete_by_org" ON public.calls
  FOR DELETE
  USING (org_id = public.current_org_for_write());

-- rubrics
DROP POLICY IF EXISTS "rubrics_select_by_org" ON public.rubrics;
CREATE POLICY "rubrics_select_by_org" ON public.rubrics
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "rubrics_write_by_org" ON public.rubrics;
CREATE POLICY "rubrics_write_by_org" ON public.rubrics
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- criteria
DROP POLICY IF EXISTS "criteria_select_by_org" ON public.criteria;
CREATE POLICY "criteria_select_by_org" ON public.criteria
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "criteria_write_by_org" ON public.criteria;
CREATE POLICY "criteria_write_by_org" ON public.criteria
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- scripts
DROP POLICY IF EXISTS "scripts_select_by_org" ON public.scripts;
CREATE POLICY "scripts_select_by_org" ON public.scripts
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "scripts_write_by_org" ON public.scripts;
CREATE POLICY "scripts_write_by_org" ON public.scripts
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

-- ─── PARTE 10: Policies — insights / marketing_runs ─────────────────────────

DROP POLICY IF EXISTS "insights_select_by_org" ON public.insights;
CREATE POLICY "insights_select_by_org" ON public.insights
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "insights_write_by_org" ON public.insights;
CREATE POLICY "insights_write_by_org" ON public.insights
  FOR ALL
  USING      (org_id = public.current_org_for_write())
  WITH CHECK (org_id = public.current_org_for_write());

DROP POLICY IF EXISTS "marketing_runs_select_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_select_by_org" ON public.marketing_runs
  FOR SELECT
  USING (org_id = public.current_org());

DROP POLICY IF EXISTS "marketing_runs_insert_by_org" ON public.marketing_runs;
CREATE POLICY "marketing_runs_insert_by_org" ON public.marketing_runs
  FOR INSERT
  WITH CHECK (org_id = public.current_org_for_write());

-- ─── PARTE 11: admin_impersonations — audit log ─────────────────────────────
-- Minimização LGPD: só (admin, org, when). Sem IP/UA por enquanto.
-- Lockdown total — só service_role acessa (createAdminClient via /api/admin/impersonate).

CREATE TABLE IF NOT EXISTS public.admin_impersonations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID REFERENCES public.users(id)         ON DELETE SET NULL,
  target_org_id   UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  CONSTRAINT admin_impersonations_lifecycle_chk
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS admin_impersonations_active_idx
  ON public.admin_impersonations(admin_user_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_impersonations_org_idx
  ON public.admin_impersonations(target_org_id, started_at DESC);

CREATE INDEX IF NOT EXISTS admin_impersonations_started_at_idx
  ON public.admin_impersonations(started_at DESC);

ALTER TABLE public.admin_impersonations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_impersonations FORCE  ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_impersonations FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.admin_impersonations TO   service_role;

CREATE OR REPLACE FUNCTION public.close_admin_impersonation(
  p_admin_user_id UUID,
  p_target_org_id UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.admin_impersonations
     SET ended_at = now()
   WHERE id = (
     SELECT id
     FROM   public.admin_impersonations
     WHERE  admin_user_id = p_admin_user_id
       AND  target_org_id = p_target_org_id
       AND  ended_at      IS NULL
     ORDER BY started_at DESC
     LIMIT 1
   )
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.close_admin_impersonation(uuid, uuid)
  TO   service_role;

COMMENT ON TABLE  public.admin_impersonations IS
  'Audit log de Admin entrando em orgs via impersonate. Uma row por sessão. Nunca exposto pra client — só service_role via createAdminClient.';

COMMENT ON COLUMN public.admin_impersonations.ended_at IS
  'NULL = sessão aberta. Set por close_admin_impersonation() ou job de cleanup futuro pra sessões >24h.';


-- BEGIN: 041_security_hardening.sql
-- ============================================================
-- 046_security_hardening.sql
-- Hardening pós code-review (2026-05-13). Cobre 3 itens:
--
--   1. api_rate_limits — tabela + check_rate_limit() RPC pra rate limit
--      de endpoints sensíveis (/api/me/password e demais state-changing).
--      Não substitui o rate limit do Supabase Auth — adiciona camada
--      controlada pela app (custom por endpoint, sem depender de feature flag).
--
--   2. clear_stale_active_org() — trigger AFTER DELETE em memberships
--      que zera users.active_org_id quando a membership da org ativa
--      é removida. Fecha janela de exposição entre remoção da membership
--      e refresh do JWT (~1h default Supabase).
--
--   3. expire_trials() — função callable via cron (pg_cron, Vercel Cron
--      ou Supabase Edge Function). Flippa subscription_status pra 'inactive'
--      onde trial_ends_at já passou. get_user_org_context já flippa on-read
--      em 040, mas o estado físico no DB ficava stale — Admin panel
--      mostrava "Trial" pra orgs efetivamente bloqueadas.
--
-- Idempotente.
-- ============================================================

-- ─── 1. Rate limit table + check function ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key          TEXT PRIMARY KEY,
  hits         INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TTL: rows expiradas são limpas no próximo check do mesmo key. Sem
-- janela de inatividade prolongada (key não-visitado), uma row pode
-- ficar pendurada — job de cleanup futuro pode dropar rows com
-- window_start < now() - interval '1 day' se quiser limpeza agressiva.
CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx
  ON public.api_rate_limits(window_start);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.api_rate_limits TO   service_role;

-- check_rate_limit(key, max_hits, window_seconds):
--   Incrementa o contador atômicamente. Se a window expirou, reseta.
--   Retorna TRUE quando dentro do limite, FALSE quando excedeu.
--
--   Caller padrão: scope key por (user_id, action) — ex.: 'password:<uuid>'
--   pra rate limit por user, OU 'login:<ip>' pra rate limit por IP.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key             TEXT,
  p_max             INT,
  p_window_seconds  INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits INT;
  v_now  TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.api_rate_limits (key, hits, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE
      WHEN public.api_rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
      THEN 1
      ELSE public.api_rate_limits.hits + 1
    END,
    window_start = CASE
      WHEN public.api_rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
      THEN v_now
      ELSE public.api_rate_limits.window_start
    END
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO   service_role;

COMMENT ON FUNCTION public.check_rate_limit IS
  'Sliding-window-like rate limiter. Retorna TRUE se a chamada está dentro do limite. Use scope keys tipo "password:<user_id>" pra isolar por user. Não é distribuído atomicamente — race entre instâncias é possível mas o ON CONFLICT serializa updates da mesma key, então o pior caso é ±1 hit por janela.';

-- ─── 2. Trigger: zera active_org_id quando membership é deletada ───────────
-- Fecha janela de exposição: Owner remove Trainer → membership DELETE →
-- trigger zera users.active_org_id do Trainer se apontava pra essa org.
-- Próxima request do Trainer → current_org() → NULL → RLS bloqueia tudo.
-- Sem trigger, Trainer continuava acessando dados da org até refresh do JWT
-- (~1h default).
--
-- IMPORTANTE: o JWT do user ainda pode ter `app_metadata.org_id` cached
-- — mas current_org() (040) ignora isso, lê só de users.active_org_id.
-- Então zerar a coluna é suficiente.

CREATE OR REPLACE FUNCTION public.clear_stale_active_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET active_org_id = NULL
  WHERE id = OLD.user_id
    AND active_org_id = OLD.org_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS memberships_clear_stale_active_org ON public.memberships;
CREATE TRIGGER memberships_clear_stale_active_org
  AFTER DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.clear_stale_active_org();

-- ─── 3. expire_trials() — função pra cron ──────────────────────────────────
-- Flippa subscription_status='trial' → 'inactive' onde trial_ends_at < now().
-- Idempotente (UPDATE não toca rows já 'inactive'). Retorna count pra
-- logging do cron caller.
--
-- Como agendar (escolha UMA):
--   (a) pg_cron (precisa extensão habilitada no Supabase Dashboard):
--       SELECT cron.schedule('expire-trials', '0 * * * *',
--         $$ SELECT public.expire_trials(); $$);
--   (b) Vercel Cron Job: GET /api/cron/expire-trials chama RPC
--   (c) Supabase Edge Function scheduled

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.organizations
  SET    subscription_status = 'inactive'
  WHERE  subscription_status = 'trial'
    AND  trial_ends_at IS NOT NULL
    AND  trial_ends_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_trials() TO   service_role;

COMMENT ON FUNCTION public.expire_trials IS
  'Flippa trials expirados pra inactive. Idempotente. Retorna número de rows atualizadas. Chamar via cron (pg_cron / Vercel Cron / Supabase Scheduled Function). get_user_org_context já trata trial vencido on-read; essa função alinha o estado físico do DB com a realidade.';


UPDATE public.rubrics SET is_default = false
WHERE org_id = '00000000-0000-0000-0000-000000000100'
  AND id != 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d'
  AND is_default = true;


-- BEGIN: 042_fix_demo_org100_auth_link.sql
-- ============================================================
-- 042_fix_demo_org100_auth_link.sql
-- Vincula os Auth users de demo (trainer@, owner@) às rows
-- corretas de public.users, memberships e trainers da org 100
-- (Dog Wizard HQ).
--
-- Problema que resolve:
--   setup-supabase.mjs cria os 3 Auth users mas não garante
--   que public.users.active_org_id esteja preenchido, nem que
--   exista membership(user_id, org_id) para eles.
--   get_user_org_context() lê users.active_org_id via JOIN —
--   sem isso, getOrgId() retorna null e todas as queries de
--   calls/rubric/trainers retornam [] silenciosamente.
--
-- Idempotente: UPDATE ... WHERE IS NULL, INSERT ... ON CONFLICT.
-- ============================================================

DO $$
DECLARE
  v_trainer_auth_id  UUID;
  v_owner_auth_id    UUID;
  v_org_id           UUID := '00000000-0000-0000-0000-000000000100';
  v_trainer_user_id  UUID := '00000000-0000-0000-0000-000000000201'; -- Marcus R.
  v_trainer_db_id    UUID := '00000000-0000-0000-0000-000000000301'; -- trainers.id do Marcus
  v_rubric_id        UUID := 'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d';
BEGIN

  -- 1. Resolver IDs reais dos Auth users via email
  SELECT id INTO v_trainer_auth_id
  FROM auth.users
  WHERE email = 'trainer@demo.askmoses.ai'
  LIMIT 1;

  SELECT id INTO v_owner_auth_id
  FROM auth.users
  WHERE email = 'owner@demo.askmoses.ai'
  LIMIT 1;

  -- ── TRAINER ──────────────────────────────────────────────────────────────────

  IF v_trainer_auth_id IS NOT NULL THEN

    -- 2a. Garantir row em public.users para o Auth user do trainer
    INSERT INTO public.users (id, name, email, avatar, avatar_color, role, invite_status, active_org_id)
    VALUES (
      v_trainer_auth_id,
      'Marcus Rivera',
      'trainer@demo.askmoses.ai',
      'MR',
      'blue',
      'trainer',
      'accepted',
      v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
      active_org_id = EXCLUDED.active_org_id,
      invite_status = 'accepted';

    -- 2b. Garantir membership
    INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_at)
    VALUES (v_trainer_auth_id, v_org_id, 'trainer', 'accepted', now())
    ON CONFLICT (user_id, org_id) DO UPDATE SET
      invite_status = 'accepted';

    -- 2c. Garantir row em trainers vinculando o Auth user_id
    -- Se o trainer mock (301) ainda está com user_id do mock (201), atualizar
    -- para o Auth user real. Caso já exista uma row com user_id=v_trainer_auth_id,
    -- só garantir org_id e invite_status.
    IF EXISTS (
      SELECT 1 FROM public.trainers WHERE id = v_trainer_db_id
    ) THEN
      UPDATE public.trainers
      SET
        user_id = v_trainer_auth_id,
        org_id  = v_org_id
      WHERE id = v_trainer_db_id;
    ELSE
      INSERT INTO public.trainers (user_id, org_id, total_calls, close_rate, close_delta, score, score_delta, last_active,
                                    score_discovery, score_problem_agitation, score_offer_presentation,
                                    score_objection_handling, score_close_next_steps)
      VALUES (v_trainer_auth_id, v_org_id, 28, 74, 9, 91, 11, 'Active today', 94, 89, 95, 81, 90);
    END IF;

    -- 2d. Vincular calls do Marcus ao Auth trainer_id real
    UPDATE public.calls
    SET trainer_id = v_trainer_auth_id
    WHERE trainer_id = v_trainer_user_id
      AND org_id = v_org_id;

  END IF;

  -- ── OWNER ─────────────────────────────────────────────────────────────────────

  IF v_owner_auth_id IS NOT NULL THEN

    -- 3a. Garantir row em public.users para o Auth user do owner
    INSERT INTO public.users (id, name, email, avatar, avatar_color, role, invite_status, active_org_id)
    VALUES (
      v_owner_auth_id,
      'Demo Owner',
      'owner@demo.askmoses.ai',
      'DO',
      'amber',
      'owner',
      'accepted',
      v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
      active_org_id = EXCLUDED.active_org_id,
      invite_status = 'accepted';

    -- 3b. Garantir membership
    INSERT INTO public.memberships (user_id, org_id, role, invite_status, invited_at)
    VALUES (v_owner_auth_id, v_org_id, 'owner', 'accepted', now())
    ON CONFLICT (user_id, org_id) DO UPDATE SET
      invite_status = 'accepted';

  END IF;

  -- ── RUBRIC: garantir is_default=true para org 100 ────────────────────────────

  UPDATE public.rubrics
  SET
    is_default = true,
    is_active  = true,
    org_id     = v_org_id
  WHERE id = v_rubric_id;

  -- Garantir que criteria também tem org_id correto
  UPDATE public.criteria
  SET org_id = v_org_id
  WHERE rubric_id = v_rubric_id
    AND (org_id IS NULL OR org_id != v_org_id);

  -- ── SUBSCRIPTION: garantir que org 100 tem sub ativa ─────────────────────────

  UPDATE public.organizations
  SET subscription_status = 'active'
  WHERE id = v_org_id
    AND subscription_status != 'active';

  RAISE NOTICE 'trainer_auth_id=%  owner_auth_id=%', v_trainer_auth_id, v_owner_auth_id;

END $$;


-- BEGIN: 043_calls_lead_enrichment.sql
-- ============================================================
-- 043_calls_lead_enrichment.sql
--
-- Adiciona campos de enriquecimento de lead vindos do webhook
-- GHL/Pepper CRM à tabela calls:
--   lead_name    TEXT  — nome do lead recebido do CRM (pode ser NULL)
--   lead_source  TEXT  — canal de aquisição (facebook/google/organic/
--                        referral/other), normalizado pelo /api/analyze
--
-- Problema que resolve:
--   lib/db/calls.ts (dbCreateCall) já insere lead_name e lead_source
--   no payload da call, mas as colunas nunca foram adicionadas ao
--   schema — toda chamada a /api/analyze quebra em prod com
--   "Could not find the 'lead_source' column of 'calls' in the
--   schema cache" (hotfix prod 2026-05-15).
--
-- CHECK constraint: protege contra writes diretos que pulem a
--   normalização do /api/analyze (route.ts:519-524). Valores devem
--   bater com LEAD_SOURCES em lib/constants.ts:52-58.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS lead_name   TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_lead_source_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_lead_source_check
      CHECK (lead_source IS NULL OR lead_source IN
        ('facebook', 'google', 'organic', 'referral', 'other'));
  END IF;
END$$;

-- Rollback (manual):
-- ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_lead_source_check;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS lead_name,
--   DROP COLUMN IF EXISTS lead_source;


-- BEGIN: 043_overall_score_0_100.sql
-- ============================================================
-- 043_overall_score_0_100.sql
--
-- Problema: calls.overall_score guardava 0–5 (capado por outcome
-- em OUTCOME_OVERALL_CAP em lib/constants.ts) enquanto
-- calls.sections[].score (JSONB) guardava 0–100 (output cru do
-- LLM). Isso fazia o mesmo objeto Call ter campos em escalas
-- diferentes — fonte do bug "0.1, 0.2" no dashboard.
--
-- Solução: migrar overall_score para 0–100. Backfill multiplica
-- as linhas existentes por 20. Coluna continua NUMERIC(3,1) para
-- aceitar valores até 100.0.
--
-- Ordem de deploy (lib/constants.ts e app/api/analyze/route.ts
-- vão junto): este script primeiro, depois o deploy de código.
-- Durante a janela entre os dois, a heurística `s > 5 ? s/20 : s`
-- em lib/services/calls.ts cobre — todos os valores no DB ficam
-- > 5 após o backfill, e a divisão por 20 reproduz a escala antiga.
-- ============================================================

-- Passo 1: dropar view dependente. calls_ml_flat (script 036) referencia
-- overall_score, então PostgreSQL bloqueia o ALTER TYPE. A view é recriada
-- idêntica no passo 4.
DROP VIEW IF EXISTS public.calls_ml_flat;

-- Passo 2: expandir o tipo ANTES de fazer o UPDATE.
-- NUMERIC(3,1) só comporta até 99.9 — multiplicar 5.0 por 20 daria 100.0
-- e estouraria o tipo. Subir para NUMERIC(4,1) primeiro acomoda 100.0.
ALTER TABLE public.calls
  ALTER COLUMN overall_score TYPE NUMERIC(4,1) USING overall_score::numeric;

-- Passo 3: backfill — linhas pré-migração têm overall_score em [0, 5].
-- Linhas pós-migração já serão escritas em [0, 100], mas o
-- predicado <= 5 garante que esse script é idempotente.
UPDATE public.calls
SET overall_score = ROUND((overall_score * 20)::numeric, 1)
WHERE overall_score IS NOT NULL AND overall_score <= 5;

-- Passo 4: recriar calls_ml_flat (definição idêntica ao script 036).
CREATE OR REPLACE VIEW public.calls_ml_flat AS
SELECT
  c.id,
  c.org_id,
  c.trainer_id,
  c.trainer_name,
  c.trainer_email,
  c.call_date,
  c.created_at                                      AS uploaded_at,
  c.duration_seconds,
  c.overall_score,
  c.closed,
  c.call_outcome,
  c.detected_outcome,
  c.model_used,
  c.prompt_version,
  c.cost_usd,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%discovery%'
    LIMIT 1
  )                                                 AS score_discovery,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%problem%'
    LIMIT 1
  )                                                 AS score_problem_agitation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%offer%'
       OR lower(elem->>'name') LIKE '%presentation%'
    LIMIT 1
  )                                                 AS score_offer_presentation,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%objection%'
    LIMIT 1
  )                                                 AS score_objection_handling,

  (
    SELECT (elem->>'score')::numeric
    FROM jsonb_array_elements(c.sections) AS elem
    WHERE lower(elem->>'name') LIKE '%close%'
       OR lower(elem->>'name') LIKE '%next%'
    LIMIT 1
  )                                                 AS score_close_next_steps

FROM public.calls c
WHERE c.sections IS NOT NULL;

COMMENT ON VIEW public.calls_ml_flat IS
  'Desnormalização de calls para pipeline ML. '
  'Cada linha = 1 call com scores por dimensão em colunas escalares. '
  'Respeita RLS da tabela calls. '
  'Calls sem sections (legadas) são excluídas.';

-- Passo 5: constraint de range. DROP IF EXISTS porque 033 não criou nenhuma.
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_overall_score_range;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_overall_score_range
  CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100));


-- BEGIN: 044_calls_ghl_integration.sql
-- ============================================================
-- 044_calls_ghl_integration.sql
--
-- Adiciona o schema necessário para ingerir calls vindas do
-- webhook do GoHighLevel (Pepper CRM) e armazenar o transcript
-- gerado por Whisper. Não inclui campos de scoring — esse pipeline
-- (analyze, coaching email) consome estes registros depois,
-- filtrando por processing_status = 'transcribed'.
--
-- Campos:
--   external_call_id   — hash determinístico do payload do GHL para
--                        garantir idempotência (vide buildExternalCallId
--                        em lib/services/ghl-helpers.ts)
--   recording_url      — URL original do áudio no GHL (efêmera; áudio
--                        não é armazenado do nosso lado, só transcrito
--                        em memória)
--   transcript_source  — origem do transcript: 'whisper' (Whisper API),
--                        'manual' (colado/upload), 'ghl' (caso voltemos
--                        a confiar no transcript nativo do GHL no futuro)
--   processing_status  — estado do pipeline assíncrono disparado pelo
--                        webhook. 'transcribed' é o estado terminal
--                        feliz e é o ponto de fanout para features
--                        posteriores (scoring, email).
--   ingest_source      — como a call chegou no sistema. 'manual' para
--                        uploads via /dashboard/upload, 'ghl' para
--                        webhook.
--   ghl_payload        — JSONB com o payload bruto do webhook,
--                        preservado para debug, replay e para que
--                        features futuras extraiam campos sem precisar
--                        de nova migration.
--
-- organizations.ghl_location_id — mapping 1:1 entre uma org AskMoses
--                        e uma location no GHL (regra GHL-15 do doc).
--                        Hoje só temos uma org; mantém o lookup
--                        funcional para multi-tenant futuro.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Campos novos em calls ────────────────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS external_call_id  TEXT,
  ADD COLUMN IF NOT EXISTS recording_url     TEXT,
  ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ingest_source     TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ghl_payload       JSONB;

-- ─── 2. CHECK constraints (idempotentes) ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_transcript_source_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_transcript_source_check
      CHECK (transcript_source IS NULL
        OR transcript_source IN ('whisper', 'manual', 'ghl'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_processing_status_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_processing_status_check
      CHECK (processing_status IN (
        'pending', 'processing', 'transcribed',
        'no_recording', 'transcription_failed', 'webhook_failed'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calls_ingest_source_check'
      AND conrelid = 'public.calls'::regclass
  ) THEN
    ALTER TABLE public.calls
      ADD CONSTRAINT calls_ingest_source_check
      CHECK (ingest_source IN ('manual', 'ghl'));
  END IF;
END$$;

-- ─── 3. Idempotência: external_call_id único (parcial) ──────────────────────

-- Parcial porque calls antigas (ingest_source='manual') não têm
-- external_call_id e não precisam dele.
CREATE UNIQUE INDEX IF NOT EXISTS calls_external_call_id_unique_idx
  ON public.calls(external_call_id)
  WHERE external_call_id IS NOT NULL;

-- Índice de status para o consumer downstream (scoring) filtrar
-- rapidamente as calls transcritas e ainda não processadas.
CREATE INDEX IF NOT EXISTS calls_processing_status_idx
  ON public.calls(processing_status)
  WHERE processing_status IN ('transcribed', 'pending', 'processing');

-- ─── 4. organizations.ghl_location_id ────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_ghl_location_id_unique_idx
  ON public.organizations(ghl_location_id)
  WHERE ghl_location_id IS NOT NULL;

-- Backfill: associa a location atual ('l2VVQax2pxKTUZWYYsW0') à org
-- default do Ariel (Centurion/Taking). Só executa se a coluna ainda
-- não foi preenchida e se a org existir com esse nome.
UPDATE public.organizations
   SET ghl_location_id = 'l2VVQax2pxKTUZWYYsW0'
 WHERE ghl_location_id IS NULL
   AND (name ILIKE '%centurion%' OR name ILIKE '%taking%');

-- ─── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.calls_external_call_id_unique_idx;
-- DROP INDEX IF EXISTS public.calls_processing_status_idx;
-- DROP INDEX IF EXISTS public.organizations_ghl_location_id_unique_idx;
-- ALTER TABLE public.calls
--   DROP CONSTRAINT IF EXISTS calls_transcript_source_check,
--   DROP CONSTRAINT IF EXISTS calls_processing_status_check,
--   DROP CONSTRAINT IF EXISTS calls_ingest_source_check;
-- ALTER TABLE public.calls
--   DROP COLUMN IF EXISTS external_call_id,
--   DROP COLUMN IF EXISTS recording_url,
--   DROP COLUMN IF EXISTS transcript_source,
--   DROP COLUMN IF EXISTS processing_status,
--   DROP COLUMN IF EXISTS ingest_source,
--   DROP COLUMN IF EXISTS ghl_payload;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS ghl_location_id;


-- BEGIN: 044_script_versioning_and_org_scripts.sql
-- ============================================================
-- 044_script_versioning_and_org_scripts.sql
--
-- Adiciona versionamento a scripts/rubrics e cria a tabela
-- org_scripts pra associar scripts a organizações com status.
--
-- Modelo:
--   - Rubric = "major version" (ex: 1, 2, 3) — mudança grande de critérios
--   - Script = "minor version" dentro de uma rubric (ex: 1.0, 1.1, 1.2,
--     2.0) — refinamento sobre a mesma rubric base
--
-- Quando Admin cria/atualiza um script:
--   - rubric_version_snapshot = current rubrics.version (capturado no
--     momento da criação pra preservar histórico mesmo se a rubric mudar)
--   - script_minor_version = (próxima minor disponível pra essa rubric)
--
-- org_scripts vincula org × script com status:
--   - 'pending'    → Admin enviou, Owner ainda não aceitou
--   - 'active'     → Owner aceitou e está usando
--   - 'rejected'   → Owner recusou
--   Status 'deprecated' NÃO é armazenado — é derivado em SELECT:
--     status='active' AND existe script newer com mesma rubric_id.
--   Decisão: read-time computation evita triggers/jobs pra marcar
--   deprecated automaticamente quando um script novo entra. Custo: 1
--   subquery por linha no listing do Admin (~poucas dezenas de orgs).
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Versioning columns ──────────────────────────────────────────────

ALTER TABLE public.rubrics
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS rubric_version_snapshot INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS minor_version           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_template             BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.rubrics.version IS
  'Major version da rubric. Bump manual quando os critérios mudam estruturalmente.';
COMMENT ON COLUMN public.scripts.rubric_version_snapshot IS
  'Snapshot da rubrics.version no momento da criação deste script.';
COMMENT ON COLUMN public.scripts.minor_version IS
  'Minor version dentro do (rubric_id, rubric_version_snapshot). Auto-incrementado.';
COMMENT ON COLUMN public.scripts.is_template IS
  'TRUE = catálogo global que o Admin pode enviar pra orgs. FALSE = script local de uma org.';

-- Backfill: todo script existente vira 1.0 (rubric=1, minor=0) — coerente
-- com o default da rubrics.version=1.
UPDATE public.scripts
   SET rubric_version_snapshot = 1, minor_version = 0
 WHERE rubric_version_snapshot IS NULL OR minor_version IS NULL;

-- ─── 2. org_scripts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_scripts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  script_id   UUID NOT NULL REFERENCES public.scripts(id)       ON DELETE CASCADE,
  -- Status armazenado. 'deprecated' é derivado em read time (ver view abaixo).
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'active', 'rejected')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  sent_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Uma org não pode ter o mesmo script associado duas vezes — se quiser
  -- "re-enviar" o mesmo script, basta dar UPDATE no status.
  UNIQUE (org_id, script_id)
);

CREATE INDEX IF NOT EXISTS idx_org_scripts_org_id    ON public.org_scripts(org_id);
CREATE INDEX IF NOT EXISTS idx_org_scripts_script_id ON public.org_scripts(script_id);
CREATE INDEX IF NOT EXISTS idx_org_scripts_status    ON public.org_scripts(status);

-- Habilita RLS — leitura/escrita só via service role (Admin endpoints).
-- Owners/Trainers leem indiretamente pelos endpoints que já usam
-- createAdminClient nesse projeto. Sem policy explícita = bloqueado pra
-- anon/auth keys.
ALTER TABLE public.org_scripts ENABLE ROW LEVEL SECURITY;

-- ─── 3. Trigger pra atualizar updated_at ────────────────────────────────

CREATE OR REPLACE FUNCTION public.org_scripts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_scripts_updated_at ON public.org_scripts;
CREATE TRIGGER trg_org_scripts_updated_at
  BEFORE UPDATE ON public.org_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.org_scripts_touch_updated_at();

-- ─── 4. Seed: 3 templates de catálogo pra demonstração ──────────────────

-- Usa a rubric default (00000000-0000-0000-0000-000000000001) seedada
-- na migration 001. ON CONFLICT DO NOTHING permite re-rodar.

INSERT INTO public.scripts
  (id, rubric_id, name, description, sections, is_active, is_template,
   rubric_version_snapshot, minor_version)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v1.0',
    'Catálogo template — versão inicial do script de vendas.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    1, 0
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v1.2',
    'Catálogo template — refinamento de discovery e objection handling.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    1, 2
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Dog Training v2.0',
    'Catálogo template — major refresh com nova rubric.',
    '[]'::jsonb,
    FALSE,
    TRUE,
    2, 0
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 5. View pra leitura: org_scripts_current ───────────────────────────
-- Materializa o status efetivo (incluindo 'deprecated' derivado) pra
-- consumidores que querem o estado real-time sem repetir a lógica.

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  -- Status efetivo: 'active' vira 'deprecated' se existir script newer
  -- na mesma rubric_id (major maior, ou mesmo major + minor maior).
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1 FROM public.scripts s2
       WHERE s2.rubric_id = s.rubric_id
         AND s2.is_template = TRUE
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado).';


-- BEGIN: 045_org_scripts_service_role_policy.sql
-- ============================================================
-- 045_org_scripts_service_role_policy.sql
--
-- Adiciona policy explícita de service_role em org_scripts, alinhada
-- com o padrão usado pelas outras tabelas (organizations, scripts,
-- memberships, etc. — ver migrations 012, 027, 040).
--
-- Migration 044 só fez ENABLE RLS sem criar policy, contando com o fato
-- de que service_role bypassa RLS por default no Supabase. Funciona,
-- mas: (a) diverge da convenção do projeto, (b) auditoria de segurança
-- fica mais clara quando a intenção é explícita. Sem a policy, qualquer
-- acesso via anon/auth keys é bloqueado — comportamento desejado pois
-- todos os endpoints que mexem em org_scripts usam createAdminClient.
--
-- Idempotente — DROP IF EXISTS antes de CREATE.
-- ============================================================

DROP POLICY IF EXISTS "org_scripts_service_role_all" ON public.org_scripts;

CREATE POLICY "org_scripts_service_role_all" ON public.org_scripts
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- BEGIN: 045_organizations_ghl_credentials.sql
-- ============================================================
-- 045_organizations_ghl_credentials.sql
--
-- Adiciona credenciais per-org da integração GHL/Pepper.
-- Cada cliente (org) tem seu próprio Pepper configurado, com
-- locationId, Private Integration Token (PIT) e um webhook secret
-- que geramos do nosso lado.
--
-- Por que aqui e não na migration 044:
--   044 adicionou `ghl_location_id` pensando em single-tenant. Agora
--   precisamos das credenciais (token + secret) e do flag de
--   enabled. Mantém 044 estável e adiciona o que faltou em 045.
--
-- Segurança:
--   - Tokens e secret armazenados em plain text. RLS de
--     `organizations` já restringe leitura à própria org (policy
--     `orgs_select_own`). API admin lê via service_role e nunca
--     retorna plaintext em GET — apenas versão mascarada.
--   - Considerar pgsodium/Vault quando virar requisito de compliance.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_access_token        TEXT,
  ADD COLUMN IF NOT EXISTS ghl_webhook_secret      TEXT,
  ADD COLUMN IF NOT EXISTS ghl_integration_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ghl_configured_at       TIMESTAMPTZ;

-- Índice parcial: o webhook lookup precisa só de orgs habilitadas e
-- com locationId conhecido. Cobre o caminho quente (POST do Pepper).
CREATE INDEX IF NOT EXISTS organizations_ghl_enabled_idx
  ON public.organizations(ghl_location_id)
  WHERE ghl_integration_enabled = true
    AND ghl_location_id IS NOT NULL;

-- Rollback (manual):
-- DROP INDEX IF EXISTS public.organizations_ghl_enabled_idx;
-- ALTER TABLE public.organizations
--   DROP COLUMN IF EXISTS ghl_access_token,
--   DROP COLUMN IF EXISTS ghl_webhook_secret,
--   DROP COLUMN IF EXISTS ghl_integration_enabled,
--   DROP COLUMN IF EXISTS ghl_configured_at;


-- BEGIN: 046_ghl_auth_error_tracking.sql
-- ============================================================
-- 046_ghl_auth_error_tracking.sql
--
-- Suporta detecção de PIT (Private Integration Token) rotacionado
-- no Pepper. Quando o owner da location GHL rotaciona o token,
-- nossa cópia em organizations.ghl_access_token vira inválida e
-- chamadas subsequentes pra GHL API retornam 401.
--
-- Mudanças:
--   1) Novo processing_status 'auth_expired' em calls (substitui
--      o catch-all 'no_recording' / 'transcription_failed' quando
--      a causa real é 401/403 da GHL).
--   2) Coluna ghl_last_auth_error_at em organizations: timestamp
--      da última falha de auth detectada. Usado pelo banner no
--      admin UI pra avisar que o token precisa ser atualizado.
--      Limpa automaticamente quando admin cola um token novo.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Recriar CHECK constraint incluindo 'auth_expired' ──────────────────
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_processing_status_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_processing_status_check
  CHECK (processing_status IN (
    'pending', 'processing', 'transcribed',
    'no_recording', 'transcription_failed', 'webhook_failed',
    'auth_expired'
  ));

-- ─── 2. Coluna pra rastrear última falha de auth na org ────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ghl_last_auth_error_at TIMESTAMPTZ;

-- ─── Rollback (manual) ────────────────────────────────────────────────────
-- ALTER TABLE public.calls
--   DROP CONSTRAINT IF EXISTS calls_processing_status_check;
-- ALTER TABLE public.calls
--   ADD CONSTRAINT calls_processing_status_check
--   CHECK (processing_status IN (
--     'pending', 'processing', 'transcribed',
--     'no_recording', 'transcription_failed', 'webhook_failed'
--   ));
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS ghl_last_auth_error_at;


-- BEGIN: 046_org_scripts_fixes.sql
-- ============================================================
-- 046_org_scripts_fixes.sql
--
-- Corrige 3 issues identificados no code review da PR ADMIN-SAASPANEL:
--
--   1. View org_scripts_current: a EXISTS filtrava por
--      s2.is_template = TRUE, mas o catalog endpoint passou a aceitar
--      QUALQUER script (incluindo is_template=false). Resultado: scripts
--      não-template nunca marcam versões anteriores como 'deprecated'.
--      Fix: remover o filtro de is_template do EXISTS.
--
--   2. Race condition em /api/admin/scripts/send: dois admins enviando
--      concorrentemente pra mesma org podiam criar múltiplas linhas com
--      ended_at IS NULL — quebra o invariante "1 script corrente por org".
--      Fix: partial unique index (org_id) WHERE ended_at IS NULL força
--      a constraint no DB. Concurrent writes batem em 409, app retry.
--
--   3. dbGetClients estava baixando a tabela calls inteira pra computar
--      MAX(created_at) por org_id no JS. Não escala. Fix: RPC SQL que
--      faz o GROUP BY no banco.
--
-- Idempotente. Rode após 044 e 045.
-- ============================================================

-- ─── 1. Recria view sem o filtro is_template ────────────────────────────

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  -- Status efetivo: 'active' vira 'deprecated' se existir QUALQUER script
  -- (template ou não) com versão maior na mesma rubric_id. is_template
  -- ficou como flag deprecated no schema — UI não filtra mais por isso.
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1 FROM public.scripts s2
       WHERE s2.rubric_id = s.rubric_id
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado).';

-- ─── 2. Partial unique index pra race condition ─────────────────────────
-- Garante que cada org tem no máximo 1 row "aberta" (ended_at IS NULL)
-- por vez. Concurrent sends pra mesma org batem em 23505 (unique violation)
-- — caller (POST /scripts/send) deve traduzir pra erro de UX legível.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL;

-- ─── 3. RPC pra MAX(calls.created_at) por org ───────────────────────────
-- Substitui o SELECT * FROM calls + agrupamento em JS. Agora o GROUP BY
-- roda no PG; só (org_id, max_created_at) trafega na wire.
--
-- STABLE = sem side effects, pode ser cacheado dentro da transação.
-- SECURITY DEFINER não é necessário — service_role já bypass RLS.

CREATE OR REPLACE FUNCTION public.get_last_call_per_org()
RETURNS TABLE(org_id UUID, last_call_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.org_id,
    MAX(c.created_at) AS last_call_at
  FROM public.calls c
  WHERE c.org_id IS NOT NULL
  GROUP BY c.org_id;
$$;

COMMENT ON FUNCTION public.get_last_call_per_org() IS
  'Retorna (org_id, max_created_at) agregado por org. Usado pelo painel admin pra coluna Last Activity.';

-- Grant execute pro service_role (anon/auth não devem chamar diretamente).
GRANT EXECUTE ON FUNCTION public.get_last_call_per_org() TO service_role;


-- BEGIN: 047_drop_is_template.sql
-- ============================================================
-- 047_drop_is_template.sql
--
-- Remove a coluna scripts.is_template (introduzida em 044) — virou
-- dead-weight depois que o catalog endpoint passou a aceitar TODOS
-- os scripts (template ou não). A view org_scripts_current já não
-- referencia is_template após a 046.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.scripts
  DROP COLUMN IF EXISTS is_template;


-- BEGIN: 047_make_calls_columns_nullable_for_async_ingest.sql
-- ============================================================
-- 047_make_calls_columns_nullable_for_async_ingest.sql
--
-- O pipeline GHL insere a linha em `calls` ANTES do Whisper/scoring
-- rodar (a linha entra como processing_status='pending' e os campos
-- são preenchidos depois). As colunas abaixo eram NOT NULL no schema
-- original (003_create_calls_table.sql), o que bloqueia o INSERT
-- assíncrono. Tornar tudo nullable.
--
-- Padrão idêntico ao 020 (que tornou rubric_id nullable).
--
-- Defensiva: usa DO $$ ... IF EXISTS $$ porque algumas colunas legadas
-- (total_criteria, criteria) podem ter sido dropadas em ambientes
-- diferentes sem migration correspondente. Sem o IF EXISTS, rodar em
-- DB sem essas colunas quebra com "column does not exist".
--
-- Idempotente — re-rodar não muda nada.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='transcript' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN transcript DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='overall_score' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN overall_score DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='summary' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN summary DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='strengths' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN strengths DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='improvements' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN improvements DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='total_criteria' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN total_criteria DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='calls'
               AND column_name='criteria' AND is_nullable='NO') THEN
    ALTER TABLE public.calls ALTER COLUMN criteria DROP NOT NULL;
  END IF;
END$$;


-- BEGIN: 048_admin_org_list_rpc.sql
-- ============================================================
-- 048_admin_org_list_rpc.sql
--
-- RPC list_admin_organizations(): listagem paginada + filtrada de orgs
-- pro painel /admin. Substitui dbGetClients (que carregava tudo) por
-- uma query parametrizada que faz tudo no PG.
--
-- Filtros suportados (todos opcionais — NULL = sem filtro):
--   p_search             ILIKE em organizations.name
--   p_plan_code          plans.code = ?
--   p_plan_status        organizations.subscription_status = ?
--   p_script_status      effective status do script (none/pending/active/deprecated/rejected)
--   p_script_version     "1.2" → divide em major/minor
--   p_mrr_min/max        range em organizations.mrr
--   p_last_activity_*    range em MAX(calls.created_at)
--
-- Paginação: p_page (1-indexed), p_limit. Retorna also o total count
-- pré-paginação pra UI mostrar "Page X of Y".
--
-- Idempotente. Rode após 046.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  -- Cada linha é uma org enriquecida + total da query (mesmo valor em todas
  -- as linhas — trade-off pra evitar 2ª round-trip pra count). UI usa
  -- result[0].total.
  org_id                  UUID,
  org_name                TEXT,
  org_created_at          TIMESTAMPTZ,
  org_subscription_status TEXT,
  org_mrr                 NUMERIC,
  org_health              TEXT,
  org_trainers_count      INT,
  org_calls_this_month    INT,
  org_avg_score           INT,
  plan_id                 UUID,
  plan_code               TEXT,
  plan_name               TEXT,
  plan_price_cents        INT,
  plan_timeline_weeks     INT,
  plan_has_rag            BOOLEAN,
  plan_has_twilio         BOOLEAN,
  plan_has_manual_upload  BOOLEAN,
  plan_max_sales_people   INT,
  plan_features           TEXT[],
  owner_accepted          BOOLEAN,
  script_id               UUID,
  script_name             TEXT,
  script_major_version    INT,
  script_minor_version    INT,
  script_status           TEXT,        -- 'none' | pending | active | deprecated | rejected
  script_started_at       TIMESTAMPTZ,
  prev_script_major       INT,
  prev_script_minor       INT,
  last_call_at            TIMESTAMPTZ,
  total                   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
BEGIN
  -- Split "1.2" → major=1, minor=2. Aceita "1" tb (minor=NULL não filtra).
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := (split_part(p_script_version, '.', 1))::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := (split_part(p_script_version, '.', 2))::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- input malformado — não filtra
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    -- Linhas correntes (sem ended_at) de org_scripts_current — uma por org.
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    -- Previous version (último ended_at NOT NULL) — só usado quando current
    -- é pending pra UI mostrar "v_old → v_new". DISTINCT ON pega o mais
    -- recente entre os fechados.
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    -- Última atividade (MAX calls.created_at) por org.
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    -- Owner aceito por org — flag pro chip "Aguardando Owner" da UI.
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    -- Base filtrada (antes da paginação).
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version            AS script_minor,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, ARRAY[]::TEXT[]),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    f.script_major,
    f.script_minor,
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. Cada linha repete total — caller usa rows[0].total.';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;


-- BEGIN: 049_fix_admin_org_list_features_type.sql
-- ============================================================
-- 049_fix_admin_org_list_features_type.sql
--
-- Fix do return type da RPC list_admin_organizations (migration 048):
-- declarava plan_features como TEXT[], mas plans.features é JSONB no
-- banco (migration 018). Resultado: runtime error
--   "COALESCE types jsonb and text[] cannot be matched"
-- na primeira chamada da RPC.
--
-- Recria a função com plan_features JSONB. O parsing JSONB → string[]
-- fica no client (lib/db/clients.ts) via filter de typeof === 'string'.
--
-- Idempotente. Rode após 048.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                  UUID,
  org_name                TEXT,
  org_created_at          TIMESTAMPTZ,
  org_subscription_status TEXT,
  org_mrr                 NUMERIC,
  org_health              TEXT,
  org_trainers_count      INT,
  org_calls_this_month    INT,
  org_avg_score           INT,
  plan_id                 UUID,
  plan_code               TEXT,
  plan_name               TEXT,
  plan_price_cents        INT,
  plan_timeline_weeks     INT,
  plan_has_rag            BOOLEAN,
  plan_has_twilio         BOOLEAN,
  plan_has_manual_upload  BOOLEAN,
  plan_max_sales_people   INT,
  plan_features           JSONB,
  owner_accepted          BOOLEAN,
  script_id               UUID,
  script_name             TEXT,
  script_major_version    INT,
  script_minor_version    INT,
  script_status           TEXT,
  script_started_at       TIMESTAMPTZ,
  prev_script_major       INT,
  prev_script_minor       INT,
  last_call_at            TIMESTAMPTZ,
  total                   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
BEGIN
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := (split_part(p_script_version, '.', 1))::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := (split_part(p_script_version, '.', 2))::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version            AS script_minor,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, '[]'::jsonb),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    f.script_major,
    f.script_minor,
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. Cada linha repete total — caller usa rows[0].total.';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;


-- BEGIN: 050_send_script_atomic_rpc.sql
-- ============================================================
-- 050_send_script_atomic_rpc.sql
--
-- RPC transacional pro POST /api/admin/scripts/send. Antes o endpoint
-- fazia UPDATE (fechar abertas) + UPSERT (criar pending) em duas chamadas
-- separadas — se a 2ª falhasse por erro não-23505 (network/PostgREST/etc),
-- as orgs ficavam sem script corrente, dropando silenciosamente o script
-- atual delas.
--
-- send_script_to_orgs roda close + upsert dentro de uma transação única.
-- Falha de qualquer parte → rollback completo, invariante "1 script
-- corrente por org" preservado.
--
-- 23505 (violação do partial unique uniq_org_scripts_open_per_org) ainda
-- pode acontecer em race entre dois admins concorrentes — propaga pro
-- caller traduzir em HTTP 409.
--
-- Idempotente. Rode após 046 (que cria o partial unique).
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  id          UUID,
  org_id      UUID,
  script_id   UUID,
  status      TEXT,
  started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1) Fecha QUALQUER associação aberta (ended_at IS NULL) das orgs alvo,
  --    independente de status. Pending não-aceitos também fechados —
  --    necessário pra não violar o partial unique no INSERT abaixo.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id = ANY(p_org_ids)
     AND ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Se já existe linha pra essa
  --    combinação (re-envio do mesmo script), reseta pra pending e renova
  --    started_at/sent_by/ended_at=null.
  RETURN QUERY
  INSERT INTO public.org_scripts
    (org_id, script_id, status, started_at, ended_at, sent_by)
  SELECT
    unnest(p_org_ids),
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status     = 'pending',
        started_at = v_now,
        ended_at   = NULL,
        sent_by    = p_sent_by
  RETURNING
    org_scripts.id,
    org_scripts.org_id,
    org_scripts.script_id,
    org_scripts.status,
    org_scripts.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org. Tudo em uma transação.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;


-- BEGIN: 051_org_scripts_previous_and_review_rpcs.sql
-- ============================================================
-- 051_org_scripts_previous_and_review_rpcs.sql
--
-- Habilita o fluxo de review pelo Owner (accept / reject):
--   - Adiciona org_scripts.previous_script_id pra rastrear qual script
--     vigorava antes do pending (necessário pra reject restaurar).
--   - Atualiza RPC send_script_to_orgs pra popular previous_script_id
--     com o script_id ativo encerrado no mesmo ato.
--   - Cria RPC accept_org_script (pending → active).
--   - Cria RPC reject_org_script (pending → rejected + restore do
--     previous_script_id pra active, ended_at=NULL).
--
-- Owner consome via /api/scripts/accept|reject (criados depois). RLS já
-- está habilitado em org_scripts (migration 044) sem policies pra anon —
-- todas as escritas passam por createAdminClient/service_role.
--
-- Idempotente.
-- ============================================================

-- ─── 1. previous_script_id ──────────────────────────────────────────────

ALTER TABLE public.org_scripts
  ADD COLUMN IF NOT EXISTS previous_script_id UUID
    REFERENCES public.scripts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_scripts.previous_script_id IS
  'Script que vigorava como active na org no momento em que este pending foi criado. NULL se a org não tinha nenhum script ativo. Usado pra restaurar no reject.';

-- ─── 2. send_script_to_orgs (atualizado pra popular previous_script_id) ──

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  id          UUID,
  org_id      UUID,
  script_id   UUID,
  status      TEXT,
  started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Captura, antes do close, qual script estava ativo em cada org alvo.
  -- Usado depois pra popular previous_script_id no novo pending.
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (org_id)
      org_id,
      script_id AS prev_script_id
    FROM public.org_scripts
    WHERE org_id = ANY(p_org_ids)
      AND status = 'active'
      AND ended_at IS NULL
    ORDER BY org_id, started_at DESC;

  -- 1) Fecha QUALQUER associação aberta (ended_at IS NULL) das orgs alvo,
  --    independente de status. Pending não-aceitos também fechados —
  --    necessário pra não violar o partial unique no INSERT abaixo.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id = ANY(p_org_ids)
     AND ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Se já existe linha pra essa
  --    combinação (re-envio do mesmo script), reseta pra pending, renova
  --    timestamps e atualiza previous_script_id pra refletir o estado
  --    atual da org no momento deste send.
  RETURN QUERY
  INSERT INTO public.org_scripts
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(org_id)
  LEFT JOIN _prev_active prev ON prev.org_id = org_input.org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    org_scripts.id,
    org_scripts.org_id,
    org_scripts.script_id,
    org_scripts.status,
    org_scripts.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org, registrando previous_script_id pra eventual restore no reject. Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── 3. accept_org_script ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  id         UUID,
  org_id     UUID,
  script_id  UUID,
  status     TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só aceita se o registro pertence à org da sessão e está pending.
  -- Sem WHERE org_id = p_org_id, um owner mal-intencionado poderia aceitar
  -- pending de outra tenant via id direto.
  RETURN QUERY
  UPDATE public.org_scripts
     SET status = 'active'
   WHERE public.org_scripts.id     = p_org_script_id
     AND public.org_scripts.org_id = p_org_id
     AND public.org_scripts.status = 'pending'
     AND public.org_scripts.ended_at IS NULL
  RETURNING
    public.org_scripts.id,
    public.org_scripts.org_id,
    public.org_scripts.script_id,
    public.org_scripts.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

-- ─── 4. reject_org_script ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reject_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  id                  UUID,
  org_id              UUID,
  script_id           UUID,
  status              TEXT,
  restored_script_id  UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_script_id UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  -- 1) Marca o pending como rejected. ended_at = now() pra encerrar o
  --    registro (sai do "current" da org).
  UPDATE public.org_scripts
     SET status   = 'rejected',
         ended_at = v_now
   WHERE public.org_scripts.id     = p_org_script_id
     AND public.org_scripts.org_id = p_org_id
     AND public.org_scripts.status = 'pending'
     AND public.org_scripts.ended_at IS NULL
  RETURNING previous_script_id INTO v_prev_script_id;

  -- Se não atualizou nada, o pending não existe / não é da org / já foi
  -- resolvido — sai sem restaurar nada. Retorna 0 rows (caller traduz).
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 2) Restaura o script anterior (se existia). Procura a linha mais
  --    recente em org_scripts pra (org_id, previous_script_id) e reabre
  --    como active. Se não havia previous, o org fica sem script — same
  --    behavior do reject puro.
  IF v_prev_script_id IS NOT NULL THEN
    UPDATE public.org_scripts
       SET status   = 'active',
           ended_at = NULL
     WHERE public.org_scripts.org_id    = p_org_id
       AND public.org_scripts.script_id = v_prev_script_id
       -- Pega a linha mais recente desse (org, script) — pode ter mais de
       -- uma se o script foi enviado, encerrado e re-enviado no passado.
       AND public.org_scripts.id = (
         SELECT inner_os.id
           FROM public.org_scripts inner_os
          WHERE inner_os.org_id    = p_org_id
            AND inner_os.script_id = v_prev_script_id
          ORDER BY inner_os.started_at DESC
          LIMIT 1
       );
  END IF;

  -- Retorna o pending atualizado + qual script foi restaurado (ou NULL).
  RETURN QUERY
  SELECT
    public.org_scripts.id,
    public.org_scripts.org_id,
    public.org_scripts.script_id,
    public.org_scripts.status,
    v_prev_script_id AS restored_script_id
  FROM public.org_scripts
  WHERE public.org_scripts.id = p_org_script_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;


-- BEGIN: 052_fix_send_script_ambiguous_org_id.sql
-- ============================================================
-- 052_fix_send_script_ambiguous_org_id.sql
--
-- Fix para erro 42702 ("column reference 'org_id' is ambiguous") no RPC
-- send_script_to_orgs (introduzido na migration 051). O bug:
--   A TEMP TABLE _prev_active expõe a coluna `org_id` no mesmo escopo
--   onde o INSERT/SELECT também tem RETURNING org_scripts.org_id e o
--   ON CONFLICT (org_id, script_id) — o planner não sabe qual referenciar.
--
-- Correção:
--   - Renomear coluna da TEMP TABLE pra `target_org_id` (evita colisão).
--   - Qualificar o RETURNING com prefixo da tabela.
--   - Manter previous_script_id como EXCLUDED.previous_script_id, que já
--     é unambíguo.
--
-- Idempotente. Substitui a função criada na 051.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  id          UUID,
  org_id      UUID,
  script_id   UUID,
  status      TEXT,
  started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do script ativo antes do close. Coluna renomeada pra
  -- target_org_id pra não colidir com org_scripts.org_id no escopo
  -- da função.
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  -- 1) Fecha qualquer associação aberta (ended_at IS NULL) das orgs alvo.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  -- 2) Upsert por (org_id, script_id). Re-envio do mesmo script reseta
  --    pra pending, renova timestamps e atualiza previous_script_id.
  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org, registrando previous_script_id pra eventual restore no reject. Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;


-- BEGIN: 053_backfill_org_active_script_upsert.sql
-- ============================================================
-- 053_backfill_org_active_script_upsert.sql
--
-- Substitui a 051 (que dava 23505 duplicate key). Toda org com plano
-- sem script ATIVO recebe o script seed como status='active'.
--
-- Fix vs 051: a constraint UNIQUE (org_id, script_id) vale independente
-- de ended_at. Se a org já teve esse script associado (linha encerrada,
-- ended_at NOT NULL), o INSERT da 051 colidia. Aqui usamos
-- ON CONFLICT (org_id, script_id) DO UPDATE — reativa a linha existente
-- (status='active', ended_at=NULL) em vez de duplicar.
--
-- Trocar v_seed_script_id pelo id do script default desejado.
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  v_seed_script_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scripts WHERE id = v_seed_script_id) THEN
    RAISE NOTICE '[053] Script % ausente — backfill pulado.', v_seed_script_id;
    RETURN;
  END IF;

  INSERT INTO public.org_scripts (org_id, script_id, status, started_at, ended_at)
  SELECT o.id, v_seed_script_id, 'active', now(), NULL
  FROM public.organizations o
  WHERE o.plan_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.org_scripts os
      WHERE os.org_id = o.id AND os.ended_at IS NULL
    )
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status = 'active', ended_at = NULL, started_at = now();

  RAISE NOTICE '[053] Backfill de org_scripts concluído.';
END $$;


-- BEGIN: 053_fix_send_script_returns_table_collision.sql
-- ============================================================
-- 053_fix_send_script_returns_table_collision.sql
--
-- Fix definitivo para o erro 42702 no RPC send_script_to_orgs.
-- A 052 corrigiu uma colisão na TEMP TABLE mas o erro persistia porque
-- a raiz é OUTRA: RETURNS TABLE(org_id UUID, script_id UUID, ...) declara
-- variáveis OUT implícitas no escopo da função com os mesmos nomes das
-- colunas de org_scripts. Quando o INSERT roda dentro do RETURN QUERY,
-- toda referência a `org_id` / `script_id` / `status` / `started_at`
-- (no SELECT, no ON CONFLICT, no SET) é ambígua: é a coluna da tabela
-- ou a variável OUT?
--
-- Correção: renomear todas as colunas do RETURNS TABLE com prefixo
-- `out_`, eliminando a colisão.
--
-- O endpoint que chama a função consome o resultado por posição (não
-- por nome de coluna no JSON do RPC) — o supabase-js retorna os campos
-- com os nomes do RETURNS TABLE, então o caller TS precisa ser atualizado
-- também pra ler `out_id`, `out_org_id`, etc.
--
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  out_id          UUID,
  out_org_id      UUID,
  out_script_id   UUID,
  out_status      TEXT,
  out_started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria/atualiza pending pra cada org, registrando previous_script_id pra eventual restore no reject. Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── Mesmo fix nos outros 2 RPCs criados na 051 ──────────────────────────
-- accept_org_script e reject_org_script têm o mesmo padrão RETURNS TABLE
-- com nomes idênticos a colunas — vão dar o mesmo 42702 quando chamados.

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id         UUID,
  out_org_id     UUID,
  out_script_id  UUID,
  out_status     TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status = 'active'
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING
    os.id,
    os.org_id,
    os.script_id,
    os.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

DROP FUNCTION IF EXISTS public.reject_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id                  UUID,
  out_org_id              UUID,
  out_script_id           UUID,
  out_status              TEXT,
  out_restored_script_id  UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_script_id UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  UPDATE public.org_scripts AS os
     SET status   = 'rejected',
         ended_at = v_now
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING os.previous_script_id INTO v_prev_script_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_prev_script_id IS NOT NULL THEN
    UPDATE public.org_scripts AS os
       SET status   = 'active',
           ended_at = NULL
     WHERE os.org_id    = p_org_id
       AND os.script_id = v_prev_script_id
       AND os.id = (
         SELECT inner_os.id
           FROM public.org_scripts inner_os
          WHERE inner_os.org_id    = p_org_id
            AND inner_os.script_id = v_prev_script_id
          ORDER BY inner_os.started_at DESC
          LIMIT 1
       );
  END IF;

  RETURN QUERY
  SELECT
    os.id,
    os.org_id,
    os.script_id,
    os.status,
    v_prev_script_id
  FROM public.org_scripts os
  WHERE os.id = p_org_script_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;


-- BEGIN: 054_backfill_org_active_script.sql
-- ============================================================
-- 051_backfill_org_active_script.sql
--
-- A partir desta task, toda org deve obrigatoriamente ter um script
-- ATIVO (e portanto uma rubric, derivada via scripts.rubric_id) — os
-- dois são fundamentais pra análise.
--
-- Esta migration faz o backfill: cada org com plano (plan_id NOT NULL)
-- que ainda não tem nenhuma linha aberta em org_scripts recebe o script
-- seed "Dog Training v1.0" (20000000-0000-0000-0000-000000000001,
-- seedado na migration 044) como status='active'.
--
-- Defensivo: só insere se o script seed existir. Idempotente — o
-- NOT EXISTS evita duplicar em re-runs, e o partial unique
-- uniq_org_scripts_open_per_org (migration 046) é a rede de segurança.
-- ============================================================

DO $$
DECLARE
  v_seed_script_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  -- Aborta silenciosamente se o seed não existe (044 não rodou nesse env).
  IF NOT EXISTS (SELECT 1 FROM public.scripts WHERE id = v_seed_script_id) THEN
    RAISE NOTICE '[051] Script seed % ausente — backfill pulado.', v_seed_script_id;
    RETURN;
  END IF;

  INSERT INTO public.org_scripts (org_id, script_id, status, started_at)
  SELECT
    o.id,
    v_seed_script_id,
    'active',
    now()
  FROM public.organizations o
  WHERE o.plan_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM public.org_scripts os
       WHERE os.org_id = o.id
         AND os.ended_at IS NULL
    );

  RAISE NOTICE '[051] Backfill de org_scripts concluído.';
END $$;


-- BEGIN: 055_admin_scripts_list_rpc.sql
-- ============================================================
-- 052_admin_scripts_list_rpc.sql
--
-- RPC list_admin_scripts(): listagem paginada + busca da tabela de
-- scripts pro SAAS Panel (aba "Scripts").
--
-- Busca (p_search) bate em OR contra 4 campos — se QUALQUER um casar,
-- o script fica na tabela:
--   1. scripts.name
--   2. scripts.description
--   3. versão "major.minor" (rubric_version_snapshot.minor_version)
--   4. conteúdo das sections (JSONB) — name/instructions/tips de cada
--
-- Paginação: p_page (1-indexed), p_limit. total = count pré-paginação.
--
-- Idempotente. Rode após 044.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_scripts(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.list_admin_scripts(
  p_search TEXT DEFAULT NULL,
  p_page   INT  DEFAULT 1,
  p_limit  INT  DEFAULT 25
)
RETURNS TABLE(
  id              UUID,
  name            TEXT,
  description     TEXT,
  rubric_id       UUID,
  rubric_name     TEXT,
  major_version   INT,
  minor_version   INT,
  sections_count  INT,
  criteria_count  INT,
  created_at      TIMESTAMPTZ,
  total           BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_q      TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.name,
      s.description,
      s.rubric_id,
      r.name AS rubric_name,
      COALESCE(s.rubric_version_snapshot, 1) AS major_version,
      COALESCE(s.minor_version, 0)           AS minor_version,
      -- Contagem defensiva: sections/criteria podem ser não-array.
      CASE
        WHEN jsonb_typeof(s.sections) = 'array'
        THEN jsonb_array_length(s.sections)
        ELSE 0
      END AS sections_count,
      CASE
        WHEN jsonb_typeof(s.criteria) = 'array'
        THEN jsonb_array_length(s.criteria)
        ELSE 0
      END AS criteria_count,
      s.created_at
    FROM public.scripts s
    LEFT JOIN public.rubrics r ON r.id = s.rubric_id
    WHERE
      v_q IS NULL
      OR s.name ILIKE '%' || v_q || '%'
      OR COALESCE(s.description, '') ILIKE '%' || v_q || '%'
      OR (
        COALESCE(s.rubric_version_snapshot, 1)::TEXT || '.' ||
        COALESCE(s.minor_version, 0)::TEXT
      ) ILIKE '%' || v_q || '%'
      OR (
        jsonb_typeof(s.sections) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(s.sections) AS elem
          WHERE COALESCE(elem->>'name', '')         ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'instructions', '') ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'tips', '')         ILIKE '%' || v_q || '%'
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS n FROM filtered
  )
  SELECT
    f.id,
    f.name,
    f.description,
    f.rubric_id,
    f.rubric_name,
    f.major_version,
    f.minor_version,
    f.sections_count,
    f.criteria_count,
    f.created_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.major_version ASC, f.minor_version ASC, f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_scripts IS
  'Lista paginada de scripts pro SAAS Panel. Busca em name/description/versão/sections.';

GRANT EXECUTE ON FUNCTION public.list_admin_scripts(TEXT, INT, INT) TO service_role;


-- BEGIN: 056_calls_script_id.sql
-- ============================================================
-- 056_calls_script_id.sql
--
-- Vincula cada call ao script usado na análise.
--   1. Adiciona calls.script_id (FK -> scripts, nullable, SET NULL on delete)
--   2. Garante 2 scripts na org de demo pra o filtro de /calls ter variedade
--   3. Backfill: distribui as calls existentes da org de demo entre os 2
--      scripts (corte por data — conta a história de uma troca de script)
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- ─── 1. Coluna script_id em calls ───────────────────────────────────────

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS script_id UUID
    REFERENCES public.scripts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.calls.script_id IS
  'Script usado na análise desta call. NULL = call analisada por rubric (sem script) ou anterior a esta migration.';

CREATE INDEX IF NOT EXISTS idx_calls_script_id ON public.calls(script_id);

-- ─── 2. Scripts da org de demo ──────────────────────────────────────────
-- A org de demo (...100) precisa de >= 2 scripts pra o filtro de /calls ser
-- demonstrável. Reusa a rubric das próprias calls da org pra manter script e
-- call na mesma rubric. IDs fixos -> backfill determinístico abaixo.
--   ...05a1 = Discovery-First Sales Script  (is_active = TRUE  — script atual)
--   ...05a2 = Objection Handling Script     (is_active = FALSE — script legado)

INSERT INTO public.scripts
  (id, org_id, rubric_id, name, description, sections, is_active, created_at)
SELECT
  v.id,
  '00000000-0000-0000-0000-000000000100'::uuid,
  (SELECT rubric_id FROM public.calls
     WHERE org_id = '00000000-0000-0000-0000-000000000100'
       AND rubric_id IS NOT NULL
     ORDER BY created_at LIMIT 1),
  v.name,
  v.description,
  '[]'::jsonb,
  v.is_active,
  v.created_at
FROM (
  VALUES
    ('000000000000000000000000000005a1'::uuid,
     'Discovery-First Sales Script',
     'Discovery-first script — deep discovery before presenting the offer. Currently the active team script.',
     TRUE,
     '2026-04-07T12:00:00Z'::timestamptz),
    ('000000000000000000000000000005a2'::uuid,
     'Objection Handling Script',
     'Legacy script focused on price/time objection handling. Replaced by the Discovery-First script.',
     FALSE,
     '2026-02-01T12:00:00Z'::timestamptz)
) AS v(id, name, description, is_active, created_at)
WHERE EXISTS (
  SELECT 1 FROM public.calls
   WHERE org_id = '00000000-0000-0000-0000-000000000100'
     AND rubric_id IS NOT NULL
)
ON CONFLICT (id) DO UPDATE SET
  org_id      = EXCLUDED.org_id,
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active;

-- ─── 3. Backfill das calls da org de demo ───────────────────────────────
-- Corte em 2026-04-07: calls a partir dessa data usaram o script atual
-- (Discovery-First); calls anteriores usaram o script legado. Só preenche
-- onde script_id ainda é NULL — re-rodar não sobrescreve dados reais.

UPDATE public.calls
SET script_id = CASE
  WHEN created_at >= '2026-04-07T00:00:00Z'
    THEN '000000000000000000000000000005a1'::uuid
  ELSE '000000000000000000000000000005a2'::uuid
END
WHERE org_id = '00000000-0000-0000-0000-000000000100'
  AND script_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.scripts
     WHERE id = '000000000000000000000000000005a1'::uuid
  );

ALTER TABLE scripts ADD COLUMN IF NOT EXISTS full_script TEXT;


-- BEGIN: 056_seed_demo_active_script.sql
-- ============================================================
-- 056_seed_demo_active_script.sql
-- Insere o script ativo da Dog Wizard HQ com as 5 seções
-- da rubrica padrão de adestramento, para uso na tela de
-- Script Intelligence (/dashboard/insights).
-- ============================================================

-- IDs de referência:
-- org:    00000000-0000-0000-0000-000000000100  → Dog Wizard HQ
-- rubric: b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d  → Dog Training Sales Rubric
-- script: 00000000-0000-0000-0000-000000000701  → Discovery-First Sales Script v2

-- Desativar qualquer script ativo existente da org antes de inserir o novo
UPDATE public.scripts
SET is_active = false
WHERE org_id = '00000000-0000-0000-0000-000000000100'
  AND is_active = true;

INSERT INTO public.scripts (
  id,
  org_id,
  rubric_id,
  name,
  description,
  sections,
  full_script,
  criteria,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000100',
  'b4e99b19-b2f7-4ab3-b48e-bbe134c6d91d',
  'Discovery-First Sales Script',
  'Discovery-first script — deep discovery before presenting the offer. Currently the active team script.',
  jsonb_build_array(
    jsonb_build_object(
      'name',         'Discovery',
      'instructions', 'Start by taking control of the conversation. Introduce yourself and state the purpose of the call. Ask at least 3 open-ended questions before presenting anything: "What is going on with [dog name] that brought you to us today?", "How long has this been happening?", "How does this affect your daily life?". Do not mention the offer until the prospect has described the problem in their own words.',
      'tips',         'Use the prospect''s dog name throughout. Take notes on specific words they use to describe the problem — mirror them back later. Silence after a question is your friend.',
      'weight',       30,
      'critical',     true
    ),
    jsonb_build_object(
      'name',         'Problem Agitation',
      'instructions', 'After discovery, deepen the emotional impact of the problem. Ask: "How does it make you feel when this happens?", "Has this affected your relationship with your dog?", "What have you tried before?". Connect the problem to real costs — financial, emotional, relational. Make the prospect feel the urgency of solving it now, not later.',
      'tips',         'Do not rush this phase. The close rate is directly tied to how well you agitate here. A prospect who feels the pain deeply will overcome their own objections.',
      'weight',       25,
      'critical',     true
    ),
    jsonb_build_object(
      'name',         'Offer Presentation',
      'instructions', 'Only present the offer after the prospect has clearly expressed their pain. Present the program as the specific solution to what they described: "Based on everything you told me about [problem], here is exactly what we do...". Present value first, price last. Use concrete outcomes: "By session 3, most owners see X. By the end of the program, your dog will Y."',
      'tips',         'Never present the price before the value. If they ask for price early, redirect: "I want to make sure this is the right fit first — can I ask you a couple more questions?"',
      'weight',       20,
      'critical',     false
    ),
    jsonb_build_object(
      'name',         'Objection Handling',
      'instructions', 'Handle objections with the Feel-Felt-Found framework: "I understand how you feel. Other owners felt the same way. What they found was...". For price objections, anchor to the cost of inaction: "How much has this already cost you — in damaged furniture, vet visits, stress?". Never discount. Reframe, redirect, and hold value.',
      'tips',         'The biggest mistake is going defensive. Stay calm, stay on value. If they say "I need to think about it", ask: "What specifically would you need to think through? I want to make sure I answered everything."',
      'weight',       15,
      'critical',     false
    ),
    jsonb_build_object(
      'name',         'Close & Next Steps',
      'instructions', 'Ask for the close directly: "Based on everything we discussed, does this sound like the right solution for you and [dog name]?". If yes, confirm date, time, and deposit on the call — do not leave it open. If they need time, set a specific follow-up: "Let''s schedule a 15-min call for Thursday at 10am to answer any remaining questions." Never end a call without a defined next step.',
      'tips',         'The close is a natural result of a well-run call. If you get strong resistance here, the issue is usually in discovery or agitation — not the close itself.',
      'weight',       10,
      'critical',     false
    )
  ),
  'Start with deep discovery (3+ questions). Agitate the problem emotionally. Present the offer only after the prospect has described their pain in full. Handle objections with Feel-Felt-Found. Close directly and always define the next step before hanging up.',
  '[]'::jsonb,
  true,
  '2026-01-15T08:00:00Z',
  '2026-01-15T08:00:00Z'
)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  sections    = EXCLUDED.sections,
  full_script = EXCLUDED.full_script,
  is_active   = EXCLUDED.is_active,
  updated_at  = now();

-- Garantir que o org_scripts aponte para este script como ativo
-- (usa upsert para não duplicar se já existir)
INSERT INTO public.org_scripts (
  org_id,
  script_id,
  status,
  started_at
)
VALUES (
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000701',
  'active',
  '2026-01-15T08:00:00Z'
)
ON CONFLICT DO NOTHING;


-- BEGIN: 057_coaching_notifications.sql
-- ============================================================
-- 057_coaching_notifications.sql
--
-- Notificações de coaching: quando o Owner envia uma recomendação no
-- Team Command Center (AI Coaching Recommendations → Revisar e enviar),
-- o sales person recebe uma notificação no sino do header.
--
-- Acesso só via service role (RLS on, sem policies) — mesmo padrão de
-- org_scripts (migration 044). Os endpoints em /api/coaching/notifications
-- usam createAdminClient e fazem o scoping por org/trainer na aplicação.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coaching_notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Trainer destinatário. Resolvido no envio pelo nome (via calls.trainer_name,
  -- consistente com os nomes da tela de coaching). Nullable: se o nome não
  -- casar com nenhum trainer, a notificação ainda é gravada com recipient_name.
  recipient_trainer_id UUID REFERENCES public.trainers(id) ON DELETE CASCADE,
  recipient_name       TEXT NOT NULL,
  -- Quem enviou (Owner). sent_by_name é denormalizado pra exibição.
  sent_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_name         TEXT NOT NULL,
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'unread'
                         CHECK (status IN ('unread', 'read')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at              TIMESTAMPTZ
);

COMMENT ON TABLE public.coaching_notifications IS
  'Recomendações de coaching enviadas pelo Owner ao sales person, lidas no sino do header do trainer.';

CREATE INDEX IF NOT EXISTS idx_coaching_notifications_recipient
  ON public.coaching_notifications(recipient_trainer_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_notifications_org
  ON public.coaching_notifications(org_id);

-- RLS on, sem policies → bloqueado pra anon/auth keys; só service role acessa.
ALTER TABLE public.coaching_notifications ENABLE ROW LEVEL SECURITY;


-- BEGIN: 057_script_intelligence_cache.sql
-- ============================================================
-- 057_script_intelligence_cache.sql
-- Cache de resultado de Script Intelligence por org_script_id.
-- Guarda o resultado da IA + decisões do owner por sugestão.
-- Invalidado naturalmente quando o pending é resolvido (novo
-- orgScriptId = nova linha de cache).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.script_intelligence_cache (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_script_id    UUID NOT NULL,                    -- FK lógica para org_scripts.id
  result           JSONB NOT NULL,                   -- ScriptIntelligenceResult completo
  decisions        JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de { index, decision, editedText }
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, org_script_id)
);

ALTER TABLE public.script_intelligence_cache ENABLE ROW LEVEL SECURITY;

-- Service role tem acesso total (API routes usam admin client)
CREATE POLICY "sic_service_role" ON public.script_intelligence_cache
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Owner pode ler o cache da própria org via JWT
CREATE POLICY "sic_select_org" ON public.script_intelligence_cache
  FOR SELECT
  USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

-- TTL: expirar cache com mais de 30 dias (cleanup manual ou pg_cron futuro)
-- Por ora apenas um índice para queries rápidas
CREATE INDEX IF NOT EXISTS idx_sic_org_script ON public.script_intelligence_cache (org_id, org_script_id);


-- BEGIN: 058_coaching_channel_prefs.sql
-- ============================================================
-- 058_coaching_channel_prefs.sql
--
-- Preferências de canal de coaching por trainer. O trainer escolhe em
-- /me/settings quais canais mantém ativos para receber recomendações:
--   in_app → recomendação aparece no sino do header
--   email  → recomendação é enviada por email (lib/email/coaching-rec-template)
--
-- Quando o Owner envia uma recomendação (POST /api/coaching/notifications),
-- a entrega faz fan-out apenas para os canais ativos do trainer destinatário.
--
-- Ausência de linha = ambos os canais ativos (default). Um trainer que nunca
-- abriu /me/settings continua recebendo tudo — comportamento idêntico ao
-- anterior à migration 058.
--
-- Invariante: pelo menos um canal sempre ativo (CHECK in_app OR email). O
-- trainer não pode se tornar incontactável — o Owner sempre tem por onde
-- entregar a recomendação. Garantido também na API e na UI.
--
-- Acesso só via service role (RLS on, sem policies) — mesmo padrão de
-- coaching_notifications (057). O scoping por trainer é feito na aplicação.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coaching_channel_prefs (
  trainer_id  UUID PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  in_app      BOOLEAN NOT NULL DEFAULT true,
  email       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Pelo menos um canal precisa ficar ativo — senão o Owner não teria como
  -- entregar a recomendação ao trainer.
  CONSTRAINT coaching_channel_prefs_at_least_one CHECK (in_app OR email)
);

COMMENT ON TABLE public.coaching_channel_prefs IS
  'Preferências de canal (in-app / email) por trainer para recomendações de coaching. Ausência de linha = ambos os canais ativos.';

-- RLS on, sem policies → bloqueado pra anon/auth keys; só service role acessa.
ALTER TABLE public.coaching_channel_prefs ENABLE ROW LEVEL SECURITY;


-- BEGIN: 058_fix_send_script_previous_fallback.sql
-- ============================================================
-- 058_fix_send_script_previous_fallback.sql
--
-- Corrige a RPC send_script_to_orgs para buscar o previous_script_id
-- com fallback: primeiro tenta org_scripts (status='active'), e se não
-- encontrar, tenta scripts (is_active=true, org_id=org_id). Isso garante
-- que orgs que têm script ativo apenas via scripts.is_active (sem linha
-- em org_scripts) também tenham o previous correto registrado.
--
-- Também garante que antes do send, toda org com scripts.is_active=true
-- tenha uma linha correspondente em org_scripts status='active'.
--
-- Idempotente. Rode após 057.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  id          UUID,
  org_id      UUID,
  script_id   UUID,
  status      TEXT,
  started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do script ativo antes do close.
  -- Prioridade 1: linha em org_scripts com status='active' e ended_at IS NULL.
  -- Prioridade 2: scripts.is_active=true para a org (script ativo que ainda não
  --   tem linha em org_scripts).
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (combined.target_org_id)
      combined.target_org_id,
      combined.prev_script_id,
      combined.priority
    FROM (
      -- P1: org_scripts ativo
      SELECT
        os.org_id    AS target_org_id,
        os.script_id AS prev_script_id,
        1            AS priority
      FROM public.org_scripts os
      WHERE os.org_id = ANY(p_org_ids)
        AND os.status = 'active'
        AND os.ended_at IS NULL

      UNION ALL

      -- P2: scripts.is_active=true (fallback para orgs sem linha em org_scripts)
      SELECT
        s.org_id     AS target_org_id,
        s.id         AS prev_script_id,
        2            AS priority
      FROM public.scripts s
      WHERE s.org_id = ANY(p_org_ids)
        AND s.is_active = true
    ) combined
    ORDER BY combined.target_org_id, combined.priority ASC;

  -- 1) Fecha qualquer associação aberta (ended_at IS NULL) das orgs alvo.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  -- 2) Upsert pending com previous_script_id correto.
  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria pending com previous_script_id via fallback (org_scripts ativo → scripts.is_active). Transacional.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;


-- BEGIN: 059_org_scripts_active_lifecycle.sql
-- ============================================================
-- 059_org_scripts_active_lifecycle.sql
--
-- Conserta o ciclo de vida do active em org_scripts. send_script_to_orgs
-- (migration 050-053) fechava o active assim que um pending era enviado,
-- deixando a org sem script atual durante a janela de review — inclusive
-- em caso de reject, onde o active devia continuar sem mudança.
--
-- Regra correta (cada row é um período da vida do script na org):
--   status='active'  + ended_at IS NULL     → script ATUAL da org.
--   status='active'  + ended_at IS NOT NULL → active histórico (deprecated).
--   status='pending' + ended_at IS NULL     → proposta em review.
--   status='pending' + ended_at IS NOT NULL → proposta substituída por outra.
--   status='rejected'+ ended_at IS NOT NULL → proposta declinada pelo owner.
--
--   Active e pending COEXISTEM (1 cada por org) durante review. accept
--   fecha o active corrente (só seta ended_at, status='active' preservado);
--   reject só fecha o pending. Status do active corrente NUNCA muda via
--   send/accept/reject — só timestamps.
--
-- Mudanças:
--   1. Reverte 'superseded' (se versão anterior da 057 foi aplicada por engano)
--      pra 'active' — o modelo final não tem esse status.
--   2. Substitui partial unique único `uniq_org_scripts_open_per_org` pelo
--      par (1 active + 1 pending por org). DEVE rodar antes do backfill
--      pra evitar 23505 em orgs que já têm pending aberto.
--   3. Backfill: reabre o último active histórico de cada org que ficou sem
--      active aberto (resultado dos sends antigos).
--   4. send_script_to_orgs: cria/atualiza pending, NÃO fecha active.
--   5. accept_org_script: fecha active (só ended_at) + promove pending a active.
--   6. reject_org_script: fecha pending. Active intocado, sem restore.
--
-- Idempotente. Rode após 056.
-- ============================================================

-- ─── 1. Reverte 'superseded' se aplicado antes ──────────────────────────
-- Status final é só ('pending','active','rejected'). Se uma versão anterior
-- da 057 tinha introduzido 'superseded', revertemos antes de redeclarar
-- o CHECK.

UPDATE public.org_scripts
   SET status = 'active'
 WHERE status = 'superseded';

ALTER TABLE public.org_scripts
  DROP CONSTRAINT IF EXISTS org_scripts_status_check;

ALTER TABLE public.org_scripts
  ADD CONSTRAINT org_scripts_status_check
  CHECK (status IN ('pending', 'active', 'rejected'));

-- Drop do invariant CHECK (versão anterior da 057). Modelo novo permite
-- active|pending com ended_at IS NOT NULL como rows históricas.
ALTER TABLE public.org_scripts
  DROP CONSTRAINT IF EXISTS org_scripts_status_ended_at_invariant;

-- ─── 2. Partial uniques: 1 active + 1 pending por org ───────────────────
-- IMPORTANTE: roda ANTES do backfill que reabre active. Caso contrário,
-- orgs que já têm pending aberto (e estamos prestes a reabrir o active)
-- violariam o partial unique antigo (1 row aberta por org, sem distinção
-- de status).

DROP INDEX IF EXISTS public.uniq_org_scripts_open_per_org;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_active_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_scripts_open_pending_per_org
  ON public.org_scripts (org_id)
  WHERE ended_at IS NULL AND status = 'pending';

-- ─── 3. Reabre o último active de cada org sem active aberto ────────────

UPDATE public.org_scripts AS reopen
   SET ended_at = NULL
  FROM (
    SELECT DISTINCT ON (os.org_id)
      os.id
    FROM public.org_scripts os
    WHERE os.status = 'active'
      AND os.ended_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.org_scripts cur
        WHERE cur.org_id = os.org_id
          AND cur.status = 'active'
          AND cur.ended_at IS NULL
      )
    ORDER BY os.org_id, os.ended_at DESC
  ) AS pick
 WHERE reopen.id = pick.id;

-- ─── 4. send_script_to_orgs — NÃO fecha active ──────────────────────────

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  out_id          UUID,
  out_org_id      UUID,
  out_script_id   UUID,
  out_status      TEXT,
  out_started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do active corrente por org → previous_script_id da proposta.
  CREATE TEMP TABLE _curr_active ON COMMIT DROP AS
    SELECT DISTINCT ON (os.org_id)
      os.org_id    AS target_org_id,
      os.script_id AS prev_script_id
    FROM public.org_scripts os
    WHERE os.org_id = ANY(p_org_ids)
      AND os.status = 'active'
      AND os.ended_at IS NULL
    ORDER BY os.org_id, os.started_at DESC;

  -- Fecha pending anterior (admin envia outra proposta antes da revisão).
  -- Active corrente fica intocado.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.status = 'pending'
     AND os.ended_at IS NULL;

  -- Upsert do novo pending. ON CONFLICT (org, script):
  --   - Se a row existente é o active corrente da org, no-op
  --     (send do mesmo script atual não faz sentido).
  --   - Senão, reseta pra pending (renova started_at, zera ended_at).
  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _curr_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
    WHERE NOT (tgt.status = 'active' AND tgt.ended_at IS NULL)
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Cria/atualiza pending por org. NÃO fecha active corrente. Fecha pending anterior se existir.';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;

-- ─── 5. accept_org_script — fecha active + promove pending ──────────────

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id         UUID,
  out_org_id     UUID,
  out_script_id  UUID,
  out_status     TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fecha active corrente: status='active' preservado, só seta ended_at.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = p_org_id
     AND os.status = 'active'
     AND os.ended_at IS NULL;

  -- Promove pending → active.
  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status = 'active'
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING
    os.id,
    os.org_id,
    os.script_id,
    os.status;
END;
$$;

COMMENT ON FUNCTION public.accept_org_script IS
  'Fecha active corrente (só ended_at) + promove pending a active. Status do active anterior preservado.';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

-- ─── 6. reject_org_script — fecha pending, active intocado ──────────────
-- previous_script_id segue na coluna (compat com caller TS) mas não é mais
-- usado pra restore: active corrente nunca foi fechado, não há o que restaurar.

DROP FUNCTION IF EXISTS public.reject_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.reject_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id                  UUID,
  out_org_id              UUID,
  out_script_id           UUID,
  out_status              TEXT,
  out_restored_script_id  UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  RETURN QUERY
  WITH rejected AS (
    UPDATE public.org_scripts AS os
       SET status   = 'rejected',
           ended_at = v_now
     WHERE os.id     = p_org_script_id
       AND os.org_id = p_org_id
       AND os.status = 'pending'
       AND os.ended_at IS NULL
    RETURNING os.id, os.org_id, os.script_id, os.status, os.previous_script_id
  )
  SELECT
    r.id,
    r.org_id,
    r.script_id,
    r.status,
    r.previous_script_id
  FROM rejected r;
END;
$$;

COMMENT ON FUNCTION public.reject_org_script IS
  'Fecha pending como rejected. Active corrente da org não é tocado.';

GRANT EXECUTE ON FUNCTION public.reject_org_script(UUID, UUID) TO service_role;


-- BEGIN: 059_sic_analysis_status.sql
-- ============================================================
-- 059_sic_analysis_status.sql
-- Adiciona analysis_status à tabela script_intelligence_cache.
-- Permite que o admin dispare a análise no envio e o owner
-- veja "Analisando..." enquanto a IA processa.
-- ============================================================

ALTER TABLE public.script_intelligence_cache
  ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (analysis_status IN ('processing', 'ready', 'error'));

COMMENT ON COLUMN public.script_intelligence_cache.analysis_status IS
  'processing = IA ainda rodando | ready = resultado disponível | error = falha na análise';


-- BEGIN: 060_admin_org_list_rpc_filter_active.sql
-- ============================================================
-- 060_admin_org_list_rpc_filter_active.sql
--
-- list_admin_organizations precisa filtrar current_scripts por
-- effective_status IN ('active','deprecated') agora que a 057 permite
-- active + pending coexistirem. Sem este fix o DISTINCT ON com
-- ORDER BY started_at DESC pega a proposta pendente como "current" do
-- painel — confunde o Admin (mostra Y pendente quando o script atual
-- da org ainda é X).
--
-- Single change: troca o WHERE da CTE current_scripts. Demais filtros,
-- ordenação e RETURNS TABLE preservados do RPC original (048/049).
--
-- Idempotente. Rode após 057.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                  UUID,
  org_name                TEXT,
  org_created_at          TIMESTAMPTZ,
  org_subscription_status TEXT,
  org_mrr                 NUMERIC,
  org_health              TEXT,
  org_trainers_count      INT,
  org_calls_this_month    INT,
  org_avg_score           NUMERIC,
  plan_id                 UUID,
  plan_code               TEXT,
  plan_name               TEXT,
  plan_price_cents        INT,
  plan_timeline_weeks     INT,
  plan_has_rag            BOOLEAN,
  plan_has_twilio         BOOLEAN,
  plan_has_manual_upload  BOOLEAN,
  plan_max_sales_people   INT,
  plan_features           TEXT[],
  owner_accepted          BOOLEAN,
  script_id               UUID,
  script_name             TEXT,
  script_major_version    INT,
  script_minor_version    INT,
  script_status           TEXT,
  script_started_at       TIMESTAMPTZ,
  prev_script_major       INT,
  prev_script_minor       INT,
  last_call_at            TIMESTAMPTZ,
  total                   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
BEGIN
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := SPLIT_PART(p_script_version, '.', 1)::INT;
      v_script_minor := SPLIT_PART(p_script_version, '.', 2)::INT;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    -- "Current" do painel = script ACTIVE (effective_status active|deprecated).
    -- Pending vive em row separada após 057 — não é mais o "current".
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
        AND osc.effective_status IN ('active', 'deprecated')
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    -- Previous version = último ended_at NOT NULL (mantido pra compat).
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version            AS script_minor,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, ARRAY[]::TEXT[]),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    f.script_major,
    f.script_minor,
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. current_scripts filtra active|deprecated (058 — pending agora coexiste com active).';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;


-- BEGIN: 060_org_scripts_promote_orphan_pending.sql
-- ============================================================
-- 060_org_scripts_promote_orphan_pending.sql
--
-- Cobre o gap da migration 057: orgs onde o send_script_to_orgs antigo
-- (050-053) fazia ON CONFLICT DO UPDATE setando status='pending' por cima
-- do active. Resultado: a org ficou COM TODAS as rows como 'pending' e
-- 0 actives no histórico — então o backfill da 057 (que reabre o último
-- status='active' fechado) não tinha o que reabrir.
--
-- Sintoma: send_script_to_orgs roda OK e cria/atualiza pending, mas o
-- painel /admin (list_admin_organizations com filtro effective_status
-- IN active|deprecated da 058/059) segue mostrando "NO SCRIPT" porque
-- a org não tem nenhum active.
--
-- Fix: pra cada org sem nenhuma row 'active' (qualquer ended_at),
-- promover o pending mais recente (preferindo o aberto, senão o último
-- fechado por started_at) a status='active', ended_at=NULL. Trata como
-- aceite implícito do estado real anterior ao bug.
--
-- Não toca em:
--   - Orgs que JÁ têm pelo menos uma row 'active' (qualquer ended_at).
--   - Rows 'rejected' (decisão explícita do owner, preservada).
--
-- Idempotente. Rodar depois cria 0 atualizações.
-- ============================================================

UPDATE public.org_scripts AS promote
   SET status   = 'active',
       ended_at = NULL
  FROM (
    SELECT DISTINCT ON (os.org_id)
      os.id
    FROM public.org_scripts os
    WHERE os.status = 'pending'
      AND NOT EXISTS (
        -- Org não tem NENHUMA active na história (qualquer ended_at).
        SELECT 1 FROM public.org_scripts any_active
        WHERE any_active.org_id = os.org_id
          AND any_active.status = 'active'
      )
    -- Preferência:
    --   1º) pending aberto (ended_at IS NULL) — esse era o estado vivo.
    --   2º) último pending fechado por started_at DESC — orgs onde tudo
    --       foi fechado (raro, mas defendível).
    ORDER BY os.org_id,
             (os.ended_at IS NULL) DESC,
             os.started_at         DESC
  ) AS pick
 WHERE promote.id = pick.id;


-- BEGIN: 060_sic_queued_status.sql
-- ============================================================
-- 060_sic_queued_status.sql
-- Adiciona 'queued' ao CHECK de analysis_status para suportar
-- envio sequencial: orgs na fila aguardam a anterior terminar.
-- ============================================================

-- Remove o constraint antigo e recria com 'queued' incluído.
ALTER TABLE public.script_intelligence_cache
  DROP CONSTRAINT IF EXISTS script_intelligence_cache_analysis_status_check;

ALTER TABLE public.script_intelligence_cache
  ADD CONSTRAINT script_intelligence_cache_analysis_status_check
    CHECK (analysis_status IN ('queued', 'processing', 'ready', 'error'));

COMMENT ON COLUMN public.script_intelligence_cache.analysis_status IS
  'queued = na fila aguardando | processing = IA rodando | ready = resultado disponível | error = falha';


-- BEGIN: 061_fix_admin_org_list_features_type.sql
-- ============================================================
-- 061_fix_admin_org_list_features_type.sql
--
-- Conserta regressão da migration 060. Ao reescrever list_admin_organizations
-- pra filtrar current_scripts por effective_status IN ('active','deprecated'),
-- a 060 copiou a estrutura do RPC original (048) e perdeu o fix da 049 nos
-- tipos do RETURNS TABLE:
--   - plan_features: declarava TEXT[], mas plans.features é JSONB no schema
--     (migration 018) → COALESCE(f.features, ARRAY[]::TEXT[]) joga
--     "COALESCE types jsonb and text[] cannot be matched" em runtime.
--   - org_avg_score: declarava NUMERIC, mas a 049 padronizou em INT.
--
-- Esta migration recria o RPC com:
--   - Tipos corretos do RETURNS TABLE (JSONB + INT, alinhado com 049).
--   - O filtro novo da 058 preservado (current_scripts só active|deprecated).
--
-- Idempotente. Rode após 058.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                  UUID,
  org_name                TEXT,
  org_created_at          TIMESTAMPTZ,
  org_subscription_status TEXT,
  org_mrr                 NUMERIC,
  org_health              TEXT,
  org_trainers_count      INT,
  org_calls_this_month    INT,
  org_avg_score           INT,
  plan_id                 UUID,
  plan_code               TEXT,
  plan_name               TEXT,
  plan_price_cents        INT,
  plan_timeline_weeks     INT,
  plan_has_rag            BOOLEAN,
  plan_has_twilio         BOOLEAN,
  plan_has_manual_upload  BOOLEAN,
  plan_max_sales_people   INT,
  plan_features           JSONB,
  owner_accepted          BOOLEAN,
  script_id               UUID,
  script_name             TEXT,
  script_major_version    INT,
  script_minor_version    INT,
  script_status           TEXT,
  script_started_at       TIMESTAMPTZ,
  prev_script_major       INT,
  prev_script_minor       INT,
  last_call_at            TIMESTAMPTZ,
  total                   BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
BEGIN
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := SPLIT_PART(p_script_version, '.', 1)::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := SPLIT_PART(p_script_version, '.', 2)::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    -- "Current" do painel = script ACTIVE (effective_status active|deprecated).
    -- Pending vive em row separada após 057 — não é mais o "current".
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
        AND osc.effective_status IN ('active', 'deprecated')
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version            AS script_minor,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, '[]'::jsonb),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    f.script_major,
    f.script_minor,
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. current_scripts filtra active|deprecated (058 + 059 — pending coexiste após 057; tipos do retorno alinhados com 049: JSONB features, INT avg_score).';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;


-- BEGIN: 061_sic_resolution.sql
-- ============================================================
-- 061_sic_resolution.sql
-- Adiciona coluna resolution à tabela script_intelligence_cache.
-- Persiste a decisão global do owner (accepted/rejected) para
-- que após refresh a tela continue mostrando o estado correto.
-- ============================================================

ALTER TABLE public.script_intelligence_cache
  ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT NULL
    CHECK (resolution IN ('accepted', 'rejected'));

COMMENT ON COLUMN public.script_intelligence_cache.resolution IS
  'accepted = owner aprovou o script | rejected = owner recusou | null = ainda pendente';


-- BEGIN: 062_fix_deprecated_scope.sql
-- ============================================================
-- 062_fix_deprecated_scope.sql
--
-- Corrige a view org_scripts_current: o status 'deprecated' estava sendo
-- derivado comparando contra TODOS os scripts do catálogo (s2 em public.scripts),
-- mesmo que esse script mais novo nunca tivesse sido enviado para a org.
--
-- Resultado do bug: owner aceita v2.1, mas v2.2 existe no catálogo geral →
-- effective_status volta 'deprecated' imediatamente, mesmo que v2.2 ainda
-- não tenha sido enviada para essa org.
--
-- Fix: o EXISTS agora filtra por org_scripts (scripts enviados para a org),
-- não pela tabela global scripts. Um script só depreca o anterior se ele
-- foi efetivamente enviado para aquela mesma org (org_id = os.org_id).
--
-- Idempotente (CREATE OR REPLACE). Rode após 061.
-- ============================================================

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  -- Status efetivo: 'active' vira 'deprecated' apenas se ESSA ORG tem
  -- outro script (org_scripts) com versão maior na mesma rubric_id e
  -- ainda aberto (ended_at IS NULL). Compara dentro do contexto da org,
  -- não contra o catálogo global.
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1
        FROM public.org_scripts os2
        JOIN public.scripts s2 ON s2.id = os2.script_id
       WHERE os2.org_id = os.org_id
         AND s2.rubric_id = s.rubric_id
         AND os2.ended_at IS NULL
         AND os2.id <> os.id
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado). '
  'A partir da migration 062, deprecated só é calculado contra scripts enviados '
  'para a mesma org — não contra o catálogo global.';


-- PRE-063: 063 muda ordem das colunas da view; CREATE OR REPLACE VIEW rejeita isso.
DROP VIEW IF EXISTS public.org_scripts_current CASCADE;


-- BEGIN: 063_three_part_versioning.sql
-- ============================================================
-- 063_three_part_versioning.sql
--
-- Introduz o terceiro segmento de versão dos scripts: owner_edit_version.
--
-- Formato final: v{rubric_version_snapshot}.{minor_version}.{owner_edit_version}
--   Segmento 1 — rubric_version_snapshot : versão da rubrica base
--   Segmento 2 — minor_version           : versão enviada pelo admin
--   Segmento 3 — owner_edit_version      : revisões feitas pelo owner (começa em 0)
--
-- Scripts existentes recebem owner_edit_version = 0 (backfill).
-- A view org_scripts_current é atualizada pra expor o novo campo.
-- As RPCs list_admin_organizations e list_admin_scripts são atualizadas
-- pra incluir o terceiro segmento.
--
-- Idempotente. Rode após 062.
-- ============================================================

-- ─── 1. Adiciona coluna na tabela scripts ───────────────────────────────

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS owner_edit_version INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.scripts.owner_edit_version IS
  'Terceiro segmento da versão: conta edições feitas diretamente pelo owner. '
  'Começa em 0 (script criado pelo admin). Incrementado cada vez que o owner '
  'salva uma edição manual no script da sua org.';

-- ─── 2. Recria view org_scripts_current com o novo campo ────────────────

CREATE OR REPLACE VIEW public.org_scripts_current AS
SELECT
  os.id,
  os.org_id,
  os.script_id,
  os.started_at,
  os.ended_at,
  os.sent_by,
  os.created_at,
  os.updated_at,
  s.name              AS script_name,
  s.rubric_id,
  s.rubric_version_snapshot,
  s.minor_version,
  s.owner_edit_version,
  CASE
    WHEN os.status = 'active' AND EXISTS (
      SELECT 1
        FROM public.org_scripts os2
        JOIN public.scripts s2 ON s2.id = os2.script_id
       WHERE os2.org_id = os.org_id
         AND s2.rubric_id = s.rubric_id
         AND os2.ended_at IS NULL
         AND os2.id <> os.id
         AND (
           s2.rubric_version_snapshot > s.rubric_version_snapshot OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version > s.minor_version) OR
           (s2.rubric_version_snapshot = s.rubric_version_snapshot
            AND s2.minor_version = s.minor_version
            AND s2.owner_edit_version > s.owner_edit_version)
         )
    ) THEN 'deprecated'
    ELSE os.status
  END AS effective_status
FROM public.org_scripts os
JOIN public.scripts s ON s.id = os.script_id;

COMMENT ON VIEW public.org_scripts_current IS
  'Read-side da relação org × script com effective_status (deprecated derivado). '
  'A partir da migration 062, deprecated só é calculado contra scripts enviados '
  'para a mesma org. Migration 063 adiciona o terceiro segmento owner_edit_version.';

-- ─── 3. Recria RPC list_admin_organizations com terceiro segmento ───────

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_mrr_min            NUMERIC       DEFAULT NULL,
  p_mrr_max            NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                     UUID,
  org_name                   TEXT,
  org_created_at             TIMESTAMPTZ,
  org_subscription_status    TEXT,
  org_mrr                    NUMERIC,
  org_health                 TEXT,
  org_trainers_count         INT,
  org_calls_this_month       INT,
  org_avg_score              INT,
  plan_id                    UUID,
  plan_code                  TEXT,
  plan_name                  TEXT,
  plan_price_cents           INT,
  plan_timeline_weeks        INT,
  plan_has_rag               BOOLEAN,
  plan_has_twilio            BOOLEAN,
  plan_has_manual_upload     BOOLEAN,
  plan_max_sales_people      INT,
  plan_features              JSONB,
  owner_accepted             BOOLEAN,
  script_id                  UUID,
  script_name                TEXT,
  script_major_version       INT,
  script_minor_version       INT,
  script_owner_edit_version  INT,
  script_status              TEXT,
  script_started_at          TIMESTAMPTZ,
  prev_script_major          INT,
  prev_script_minor          INT,
  prev_script_owner_edit     INT,
  last_call_at               TIMESTAMPTZ,
  total                      BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
BEGIN
  -- Split "1.2" or "1.2.3" → major=1, minor=2 (owner_edit not filtered).
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := (split_part(p_script_version, '.', 1))::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := (split_part(p_script_version, '.', 2))::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.script_id,
        osc.script_name,
        osc.rubric_version_snapshot,
        osc.minor_version,
        osc.owner_edit_version,
        osc.effective_status,
        osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor,
        osc.owner_edit_version      AS prev_owner_edit
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    filtered AS (
      SELECT
        o.id,
        o.name,
        o.created_at,
        o.subscription_status,
        o.mrr,
        o.health,
        o.trainers_count,
        o.calls_this_month,
        o.avg_score,
        o.plan_id,
        p.code         AS plan_code,
        p.name         AS plan_name,
        p.price_cents,
        p.timeline_weeks,
        p.has_rag,
        p.has_twilio,
        p.has_manual_upload,
        p.max_sales_people,
        p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id,
        cs.script_name,
        cs.rubric_version_snapshot  AS script_major,
        cs.minor_version             AS script_minor,
        cs.owner_edit_version        AS script_owner_edit,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major,
        ps.prev_minor,
        ps.prev_owner_edit,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_mrr_min IS NULL OR o.mrr >= p_mrr_min)
        AND (p_mrr_max IS NULL OR o.mrr <= p_mrr_max)
        AND (
          p_last_activity_from IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from
        )
        AND (
          p_last_activity_to IS NULL
          OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to
        )
    ),
    counted AS (
      SELECT COUNT(*) AS n FROM filtered
    )
  SELECT
    f.id,
    f.name,
    f.created_at,
    f.subscription_status,
    f.mrr,
    f.health,
    COALESCE(f.trainers_count, 0),
    COALESCE(f.calls_this_month, 0),
    COALESCE(f.avg_score, 0),
    f.plan_id,
    f.plan_code,
    f.plan_name,
    COALESCE(f.price_cents, 0),
    COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE),
    COALESCE(f.has_twilio, FALSE),
    COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people,
    COALESCE(f.features, '[]'::jsonb),
    f.owner_accepted,
    f.script_id,
    f.script_name,
    COALESCE(f.script_major, 1),
    COALESCE(f.script_minor, 0),
    COALESCE(f.script_owner_edit, 0),
    f.script_status,
    f.script_started_at,
    f.prev_major,
    f.prev_minor,
    COALESCE(f.prev_owner_edit, 0),
    f.last_call_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_organizations IS
  'Lista paginada e filtrada de orgs pro painel /admin. '
  'Migration 063: inclui script_owner_edit_version e prev_script_owner_edit no retorno.';

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;

-- ─── 4. Recria RPC list_admin_scripts com terceiro segmento ─────────────

DROP FUNCTION IF EXISTS public.list_admin_scripts(TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.list_admin_scripts(
  p_search TEXT DEFAULT NULL,
  p_page   INT  DEFAULT 1,
  p_limit  INT  DEFAULT 25
)
RETURNS TABLE(
  id                  UUID,
  name                TEXT,
  description         TEXT,
  rubric_id           UUID,
  rubric_name         TEXT,
  major_version       INT,
  minor_version       INT,
  owner_edit_version  INT,
  sections_count      INT,
  criteria_count      INT,
  created_at          TIMESTAMPTZ,
  total               BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_q      TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.name,
      s.description,
      s.rubric_id,
      r.name AS rubric_name,
      COALESCE(s.rubric_version_snapshot, 1)  AS major_version,
      COALESCE(s.minor_version, 0)             AS minor_version,
      COALESCE(s.owner_edit_version, 0)        AS owner_edit_version,
      CASE
        WHEN jsonb_typeof(s.sections) = 'array'
        THEN jsonb_array_length(s.sections)
        ELSE 0
      END AS sections_count,
      CASE
        WHEN jsonb_typeof(s.criteria) = 'array'
        THEN jsonb_array_length(s.criteria)
        ELSE 0
      END AS criteria_count,
      s.created_at
    FROM public.scripts s
    LEFT JOIN public.rubrics r ON r.id = s.rubric_id
    WHERE
      v_q IS NULL
      OR s.name ILIKE '%' || v_q || '%'
      OR COALESCE(s.description, '') ILIKE '%' || v_q || '%'
      OR (
        COALESCE(s.rubric_version_snapshot, 1)::TEXT || '.' ||
        COALESCE(s.minor_version, 0)::TEXT || '.' ||
        COALESCE(s.owner_edit_version, 0)::TEXT
      ) ILIKE '%' || v_q || '%'
      OR (
        jsonb_typeof(s.sections) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(s.sections) AS elem
          WHERE COALESCE(elem->>'name', '')         ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'instructions', '') ILIKE '%' || v_q || '%'
             OR COALESCE(elem->>'tips', '')         ILIKE '%' || v_q || '%'
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS n FROM filtered
  )
  SELECT
    f.id,
    f.name,
    f.description,
    f.rubric_id,
    f.rubric_name,
    f.major_version,
    f.minor_version,
    f.owner_edit_version,
    f.sections_count,
    f.criteria_count,
    f.created_at,
    counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.major_version ASC, f.minor_version ASC, f.owner_edit_version ASC, f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

COMMENT ON FUNCTION public.list_admin_scripts IS
  'Lista paginada de scripts pro SAAS Panel. Migration 063: inclui owner_edit_version no retorno.';

GRANT EXECUTE ON FUNCTION public.list_admin_scripts(TEXT, INT, INT) TO service_role;


-- BEGIN: 064_owner_password_set_metadata.sql
-- 064: Backfill app_metadata.password_set=true para usuários com senha já definida.
--
-- Contexto: o middleware passou a redirecionar owners sem app_metadata.password_set=true
-- pra /password?welcome=1&forced=1. Owners pré-existentes que já têm senha gravada em
-- auth.users.encrypted_password também precisam do flag, senão são pegos pelo gate.
--
-- Critério: encrypted_password IS NOT NULL → o user definiu senha em algum momento.
-- Update is idempotent: só seta o flag onde ainda não existe, preservando outras keys
-- em raw_app_meta_data.
--
-- Rodar manualmente via Supabase SQL editor após deploy do middleware.

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"password_set": true}'::jsonb
WHERE encrypted_password IS NOT NULL
  AND (raw_app_meta_data->>'password_set') IS DISTINCT FROM 'true';


-- BEGIN: 065_fix_send_script_returns_out_prefix.sql
-- ============================================================
-- 065_fix_send_script_returns_out_prefix.sql
--
-- A migration 058 redefiniu send_script_to_orgs sem o prefixo out_
-- no RETURNS TABLE, revertendo o fix da 053. O route.ts lê out_id,
-- out_org_id, out_script_id, out_status, out_started_at — sem o
-- prefixo o rowByOrgId fica vazio, queue.length === 0 e a análise
-- nunca é disparada.
--
-- Esta migration restaura o RETURNS TABLE com out_* e mantém o
-- fallback (org_scripts ativo → scripts.is_active) da 058.
--
-- Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.send_script_to_orgs(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.send_script_to_orgs(
  p_script_id UUID,
  p_org_ids   UUID[],
  p_sent_by   UUID
)
RETURNS TABLE(
  out_id          UUID,
  out_org_id      UUID,
  out_script_id   UUID,
  out_status      TEXT,
  out_started_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Snapshot do script ativo antes do close.
  -- Prioridade 1: linha em org_scripts com status='active' e ended_at IS NULL.
  -- Prioridade 2: scripts.is_active=true para a org (fallback para orgs sem linha em org_scripts).
  CREATE TEMP TABLE _prev_active ON COMMIT DROP AS
    SELECT DISTINCT ON (combined.target_org_id)
      combined.target_org_id,
      combined.prev_script_id,
      combined.priority
    FROM (
      SELECT
        os.org_id    AS target_org_id,
        os.script_id AS prev_script_id,
        1            AS priority
      FROM public.org_scripts os
      WHERE os.org_id = ANY(p_org_ids)
        AND os.status = 'active'
        AND os.ended_at IS NULL

      UNION ALL

      SELECT
        s.org_id     AS target_org_id,
        s.id         AS prev_script_id,
        2            AS priority
      FROM public.scripts s
      WHERE s.org_id = ANY(p_org_ids)
        AND s.is_active = true
    ) combined
    ORDER BY combined.target_org_id, combined.priority ASC;

  -- 1) Fecha qualquer associação aberta das orgs alvo.
  UPDATE public.org_scripts AS os
     SET ended_at = v_now
   WHERE os.org_id = ANY(p_org_ids)
     AND os.ended_at IS NULL;

  -- 2) Upsert pending com previous_script_id correto.
  RETURN QUERY
  INSERT INTO public.org_scripts AS tgt
    (org_id, script_id, status, started_at, ended_at, sent_by, previous_script_id)
  SELECT
    org_input.target_org_id,
    p_script_id,
    'pending',
    v_now,
    NULL,
    p_sent_by,
    prev.prev_script_id
  FROM unnest(p_org_ids) AS org_input(target_org_id)
  LEFT JOIN _prev_active prev ON prev.target_org_id = org_input.target_org_id
  ON CONFLICT (org_id, script_id) DO UPDATE
    SET status              = 'pending',
        started_at          = v_now,
        ended_at            = NULL,
        sent_by             = p_sent_by,
        previous_script_id  = EXCLUDED.previous_script_id
  RETURNING
    tgt.id,
    tgt.org_id,
    tgt.script_id,
    tgt.status,
    tgt.started_at;
END;
$$;

COMMENT ON FUNCTION public.send_script_to_orgs IS
  'Fecha associações abertas + cria pending com previous_script_id via fallback (org_scripts ativo → scripts.is_active). Transacional. RETURNS TABLE usa prefixo out_* para evitar colisão com variáveis OUT implícitas (fix 053+065).';

GRANT EXECUTE ON FUNCTION public.send_script_to_orgs(UUID, UUID[], UUID) TO service_role;


-- BEGIN: 066_fix_accept_org_script_close_previous.sql
-- ============================================================
-- 066_fix_accept_org_script_close_previous.sql
--
-- A accept_org_script só fazia SET status='active' na linha pending,
-- sem fechar a linha active anterior. Resultado: duas linhas com
-- ended_at IS NULL na mesma org → DISTINCT ON na RPC list_admin_organizations
-- pegava a linha errada e mostrava status incorreto no painel admin.
--
-- Fix: antes de ativar o pending, fecha todas as outras linhas abertas
-- da mesma org (ended_at IS NULL AND id <> p_org_script_id).
--
-- Idempotente. Rode após 065.
-- ============================================================

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id         UUID,
  out_org_id     UUID,
  out_script_id  UUID,
  out_status     TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fecha todas as outras linhas abertas da org antes de ativar o pending.
  -- Garante invariante: 1 linha com ended_at IS NULL por org após o accept.
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id   = p_org_id
     AND id      <> p_org_script_id
     AND ended_at IS NULL;

  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status = 'active'
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING
    os.id,
    os.org_id,
    os.script_id,
    os.status;
END;
$$;

COMMENT ON FUNCTION public.accept_org_script IS
  'Aceita um script pending: fecha linhas abertas anteriores da org e ativa o pending. '
  'Garante invariante de 1 linha aberta por org após o accept (fix 066).';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;


-- BEGIN: 067_accept_org_script_reset_started_at.sql
-- ============================================================
-- 067_accept_org_script_reset_started_at.sql
--
-- Conserta `accept_org_script` (redefinida em 066) pra também atualizar
-- `started_at = now()` no momento da promoção pending → active.
--
-- Sem este fix, o `started_at` da row preservava o timestamp de quando o
-- pending FOI ENVIADO — então quando consumers (org_scripts_current,
-- list_admin_organizations) ordenam por `started_at DESC` e leem o
-- "início" do active, eles veem uma data anterior ao aceite (a data do
-- envio). UI ficava mostrando "iniciado em [data antiga]" pra um active
-- que tinha acabado de ser promovido.
--
-- Mantém todo o comportamento da 066 (fecha linhas abertas anteriores
-- antes de ativar o pending). Única adição: `started_at = v_now` no
-- UPDATE de promoção.
--
-- Idempotente (CREATE OR REPLACE). Rode após 066.
-- ============================================================

DROP FUNCTION IF EXISTS public.accept_org_script(UUID, UUID);

CREATE OR REPLACE FUNCTION public.accept_org_script(
  p_org_script_id UUID,
  p_org_id        UUID
)
RETURNS TABLE(
  out_id         UUID,
  out_org_id     UUID,
  out_script_id  UUID,
  out_status     TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Fecha todas as outras linhas abertas da org antes de ativar o pending.
  -- Garante invariante: 1 linha com ended_at IS NULL por org após o accept
  -- (herdado da 066).
  UPDATE public.org_scripts
     SET ended_at = v_now
   WHERE org_id   = p_org_id
     AND id      <> p_org_script_id
     AND ended_at IS NULL;

  -- Promove pending → active. started_at reseta pra v_now: representa
  -- "quando este script começou a vigorar como active da org", coerente
  -- com o uso em org_scripts_current / list_admin_organizations.
  RETURN QUERY
  UPDATE public.org_scripts AS os
     SET status     = 'active',
         started_at = v_now
   WHERE os.id     = p_org_script_id
     AND os.org_id = p_org_id
     AND os.status = 'pending'
     AND os.ended_at IS NULL
  RETURNING
    os.id,
    os.org_id,
    os.script_id,
    os.status;
END;
$$;

COMMENT ON FUNCTION public.accept_org_script IS
  'Aceita pending: fecha linhas abertas anteriores (066) + promove pending a active com started_at = now() (067). Garante invariante de 1 row aberta por org e started_at coerente.';

GRANT EXECUTE ON FUNCTION public.accept_org_script(UUID, UUID) TO service_role;

-- ============================================================
-- Migration 071 — cobrança por minuto (substitui o MRR no /admin)
-- Mantido por último: redefine list_admin_organizations com duração dinâmica
-- (SUM(calls.duration_seconds) do mês) no lugar de org_mrr/p_mrr_*.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
);

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS total_minutes_this_month;

CREATE OR REPLACE FUNCTION public.list_admin_organizations(
  p_search             TEXT          DEFAULT NULL,
  p_plan_code          TEXT          DEFAULT NULL,
  p_plan_status        TEXT          DEFAULT NULL,
  p_script_status      TEXT          DEFAULT NULL,
  p_script_version     TEXT          DEFAULT NULL,
  p_minutes_min        NUMERIC       DEFAULT NULL,
  p_minutes_max        NUMERIC       DEFAULT NULL,
  p_last_activity_from TIMESTAMPTZ   DEFAULT NULL,
  p_last_activity_to   TIMESTAMPTZ   DEFAULT NULL,
  p_page               INT           DEFAULT 1,
  p_limit              INT           DEFAULT 25
)
RETURNS TABLE(
  org_id                       UUID,
  org_name                     TEXT,
  org_created_at               TIMESTAMPTZ,
  org_subscription_status      TEXT,
  org_total_seconds_this_month INT,
  org_health                   TEXT,
  org_trainers_count           INT,
  org_calls_this_month         INT,
  org_avg_score                INT,
  plan_id                      UUID,
  plan_code                    TEXT,
  plan_name                    TEXT,
  plan_price_cents             INT,
  plan_timeline_weeks          INT,
  plan_has_rag                 BOOLEAN,
  plan_has_twilio              BOOLEAN,
  plan_has_manual_upload       BOOLEAN,
  plan_max_sales_people        INT,
  plan_features                JSONB,
  owner_accepted               BOOLEAN,
  script_id                    UUID,
  script_name                  TEXT,
  script_major_version         INT,
  script_minor_version         INT,
  script_owner_edit_version    INT,
  script_status                TEXT,
  script_started_at            TIMESTAMPTZ,
  prev_script_major            INT,
  prev_script_minor            INT,
  prev_script_owner_edit       INT,
  last_call_at                 TIMESTAMPTZ,
  total                        BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_script_major INT := NULL;
  v_script_minor INT := NULL;
  v_offset       INT := GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 25), 0);
  v_limit        INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_month_start  TIMESTAMPTZ := date_trunc('month', timezone('UTC', now())) AT TIME ZONE 'UTC';
BEGIN
  IF p_script_version IS NOT NULL AND p_script_version <> '' THEN
    BEGIN
      v_script_major := (split_part(p_script_version, '.', 1))::INT;
      IF position('.' IN p_script_version) > 0 THEN
        v_script_minor := (split_part(p_script_version, '.', 2))::INT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_script_major := NULL;
      v_script_minor := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH
    current_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id, osc.script_id, osc.script_name,
        osc.rubric_version_snapshot, osc.minor_version, osc.owner_edit_version,
        osc.effective_status, osc.started_at
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NULL
      ORDER BY osc.org_id, osc.started_at DESC
    ),
    prev_scripts AS (
      SELECT DISTINCT ON (osc.org_id)
        osc.org_id,
        osc.rubric_version_snapshot AS prev_major,
        osc.minor_version           AS prev_minor,
        osc.owner_edit_version      AS prev_owner_edit
      FROM public.org_scripts_current osc
      WHERE osc.ended_at IS NOT NULL
      ORDER BY osc.org_id, osc.ended_at DESC
    ),
    last_calls AS (
      SELECT c.org_id, MAX(c.created_at) AS last_call_at
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
      GROUP BY c.org_id
    ),
    month_seconds AS (
      SELECT c.org_id,
             COALESCE(SUM(c.duration_seconds), 0)::INT AS total_seconds
      FROM public.calls c
      WHERE c.org_id IS NOT NULL
        AND c.created_at >= v_month_start
      GROUP BY c.org_id
    ),
    accepted_owners AS (
      SELECT DISTINCT m.org_id
      FROM public.memberships m
      WHERE m.role = 'owner' AND m.invite_status = 'accepted'
    ),
    trainer_counts AS (
      SELECT m.org_id, COUNT(*)::INT AS n
      FROM public.memberships m
      WHERE m.role = 'trainer' AND m.invite_status = 'accepted'
      GROUP BY m.org_id
    ),
    filtered AS (
      SELECT
        o.id, o.name, o.created_at, o.subscription_status,
        COALESCE(ms.total_seconds, 0) AS total_seconds_this_month,
        o.health, COALESCE(tc.n, 0) AS trainers_count, o.calls_this_month, o.avg_score, o.plan_id,
        p.code AS plan_code, p.name AS plan_name, p.price_cents, p.timeline_weeks,
        p.has_rag, p.has_twilio, p.has_manual_upload, p.max_sales_people, p.features,
        (ao.org_id IS NOT NULL) AS owner_accepted,
        cs.script_id, cs.script_name,
        cs.rubric_version_snapshot AS script_major,
        cs.minor_version           AS script_minor,
        cs.owner_edit_version      AS script_owner_edit,
        COALESCE(cs.effective_status, 'none') AS script_status,
        cs.started_at AS script_started_at,
        ps.prev_major, ps.prev_minor, ps.prev_owner_edit,
        lc.last_call_at
      FROM public.organizations o
      LEFT JOIN public.plans p ON p.id = o.plan_id
      LEFT JOIN current_scripts  cs ON cs.org_id = o.id
      LEFT JOIN prev_scripts     ps ON ps.org_id = o.id
      LEFT JOIN last_calls       lc ON lc.org_id = o.id
      LEFT JOIN month_seconds    ms ON ms.org_id = o.id
      LEFT JOIN trainer_counts   tc ON tc.org_id = o.id
      LEFT JOIN accepted_owners  ao ON ao.org_id = o.id
      WHERE o.plan_id IS NOT NULL
        AND (p_search IS NULL OR p_search = '' OR o.name ILIKE '%' || p_search || '%')
        AND (p_plan_code IS NULL OR p.code = p_plan_code)
        AND (p_plan_status IS NULL OR o.subscription_status = p_plan_status)
        AND (
          p_script_status IS NULL
          OR (p_script_status = 'none' AND cs.script_id IS NULL)
          OR (p_script_status <> 'none' AND COALESCE(cs.effective_status, 'none') = p_script_status)
        )
        AND (v_script_major IS NULL OR cs.rubric_version_snapshot = v_script_major)
        AND (v_script_minor IS NULL OR cs.minor_version = v_script_minor)
        AND (p_minutes_min IS NULL OR COALESCE(ms.total_seconds, 0) >= p_minutes_min * 60)
        AND (p_minutes_max IS NULL OR COALESCE(ms.total_seconds, 0) <= p_minutes_max * 60)
        AND (p_last_activity_from IS NULL OR COALESCE(lc.last_call_at, o.created_at) >= p_last_activity_from)
        AND (p_last_activity_to   IS NULL OR COALESCE(lc.last_call_at, o.created_at) <= p_last_activity_to)
    ),
    counted AS (SELECT COUNT(*) AS n FROM filtered)
  SELECT
    f.id, f.name, f.created_at, f.subscription_status,
    f.total_seconds_this_month,
    f.health,
    COALESCE(f.trainers_count, 0), COALESCE(f.calls_this_month, 0), COALESCE(f.avg_score, 0),
    f.plan_id, f.plan_code, f.plan_name,
    COALESCE(f.price_cents, 0), COALESCE(f.timeline_weeks, 0),
    COALESCE(f.has_rag, FALSE), COALESCE(f.has_twilio, FALSE), COALESCE(f.has_manual_upload, FALSE),
    f.max_sales_people, COALESCE(f.features, '[]'::jsonb),
    f.owner_accepted, f.script_id, f.script_name,
    COALESCE(f.script_major, 1), COALESCE(f.script_minor, 0), COALESCE(f.script_owner_edit, 0),
    f.script_status, f.script_started_at,
    f.prev_major, f.prev_minor, COALESCE(f.prev_owner_edit, 0),
    f.last_call_at, counted.n
  FROM filtered f
  CROSS JOIN counted
  ORDER BY f.name ASC
  OFFSET v_offset
  LIMIT  v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_organizations(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO service_role;

