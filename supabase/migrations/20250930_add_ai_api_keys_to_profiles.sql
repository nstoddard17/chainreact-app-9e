-- Add AI API configuration to user_profiles table
-- This allows users to save their OpenAI API keys for use in AI Agent nodes

-- First check if user_profiles table exists, create it if not
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT DEFAULT 'free',
    provider TEXT DEFAULT 'email',
    avatar_url TEXT,
    company TEXT,
    job_title TEXT,
    secondary_email TEXT,
    phone_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns for storing encrypted API keys
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS openai_api_keys JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS default_openai_model VARCHAR(50) DEFAULT 'gpt-4o-mini';

-- Add comment explaining the structure
COMMENT ON COLUMN public.user_profiles.openai_api_keys IS 'Array of OpenAI API key configurations: [{ id, name, key_encrypted, created_at }]';
COMMENT ON COLUMN public.user_profiles.default_openai_model IS 'Default OpenAI model to use in AI Agent nodes (e.g., gpt-4o, gpt-4o-mini)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_openai_api_keys ON public.user_profiles USING gin (openai_api_keys);

-- Enable RLS if not already enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.user_profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.user_profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;