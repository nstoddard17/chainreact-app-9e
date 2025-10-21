-- Add tasks and plan columns to user_profiles table

-- Add tasks_used column to track current period usage
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS tasks_used INTEGER DEFAULT 0 NOT NULL;

-- Add tasks_limit column based on plan (100 for free, 10000 for pro, etc.)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS tasks_limit INTEGER DEFAULT 100 NOT NULL;

-- Add billing_period_start to track when the current period started
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Add plan column with default value of 'free'
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' NOT NULL;

-- Update existing profiles to have default values
UPDATE public.user_profiles
SET tasks_used = 0
WHERE tasks_used IS NULL;

UPDATE public.user_profiles
SET tasks_limit = 100
WHERE tasks_limit IS NULL;

UPDATE public.user_profiles
SET billing_period_start = NOW()
WHERE billing_period_start IS NULL;

UPDATE public.user_profiles
SET plan = 'free'
WHERE plan IS NULL;

-- Add check constraint to ensure tasks_used is non-negative
ALTER TABLE public.user_profiles
ADD CONSTRAINT tasks_used_non_negative CHECK (tasks_used >= 0);

-- Add check constraint to ensure tasks_limit is positive
ALTER TABLE public.user_profiles
ADD CONSTRAINT tasks_limit_positive CHECK (tasks_limit > 0);

-- Add check constraint for valid plan values
ALTER TABLE public.user_profiles
ADD CONSTRAINT valid_plan_values CHECK (plan IN ('free', 'starter', 'professional', 'team', 'enterprise'));
