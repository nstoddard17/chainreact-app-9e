-- Add tasks_limit and tasks_used columns to profiles and teams tables
-- These columns track task quotas for workflow execution billing

-- First ensure the profiles table exists (it may have been created manually)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure teams table exists
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  organization_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add tasks columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tasks_limit INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS tasks_used INTEGER DEFAULT 0;

-- Add tasks columns to teams table
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS tasks_limit INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS tasks_used INTEGER DEFAULT 0;

-- Add check constraints (wrapped in DO block to handle if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tasks_limit_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_tasks_limit_check CHECK (tasks_limit >= -1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tasks_used_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_tasks_used_check CHECK (tasks_used >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_tasks_limit_check'
  ) THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_tasks_limit_check CHECK (tasks_limit >= -1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_tasks_used_check'
  ) THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_tasks_used_check CHECK (tasks_used >= 0);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.tasks_limit IS 'Maximum number of tasks allowed. -1 means unlimited.';
COMMENT ON COLUMN public.profiles.tasks_used IS 'Number of tasks consumed in current billing period.';
COMMENT ON COLUMN public.teams.tasks_limit IS 'Maximum number of tasks allowed. -1 means unlimited.';
COMMENT ON COLUMN public.teams.tasks_used IS 'Number of tasks consumed in current billing period.';
