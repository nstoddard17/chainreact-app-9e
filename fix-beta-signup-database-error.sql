-- First, let's drop ALL existing triggers and functions that might be causing conflicts
-- These are likely causing the 500 error during user creation

-- Drop all user-related triggers
DROP TRIGGER IF EXISTS ensure_beta_user_profile_trigger ON auth.users;
DROP TRIGGER IF EXISTS handle_beta_tester_signup_trigger ON auth.users;
DROP TRIGGER IF EXISTS auto_confirm_beta_testers_trigger ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- Drop all related functions
DROP FUNCTION IF EXISTS public.ensure_beta_user_profile();
DROP FUNCTION IF EXISTS public.handle_beta_tester_signup();
DROP FUNCTION IF EXISTS public.auto_confirm_beta_testers();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.confirm_beta_tester_after_signup(TEXT);
DROP FUNCTION IF EXISTS public.fix_beta_user_profile(TEXT);

-- Now create a SIMPLER function that just updates beta tester status
-- We'll handle profile creation entirely from the client side
CREATE OR REPLACE FUNCTION public.update_beta_tester_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update beta_testers table status
  -- Don't touch auth.users or create profiles here
  IF (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true THEN
    UPDATE public.beta_testers
    SET
      status = 'converted',
      conversion_date = NOW(),
      last_active_at = NOW()
    WHERE email = NEW.email
    AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger as AFTER INSERT to avoid conflicts
CREATE TRIGGER update_beta_tester_status_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.update_beta_tester_status();

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.update_beta_tester_status() TO service_role;

-- Ensure the user_profiles table exists with proper structure
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- Set up RLS policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first (including any variations)
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role has full access" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role bypass" ON public.user_profiles;

-- Drop any other policies that might exist
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all policies on user_profiles table
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', r.policyname);
  END LOOP;
END $$;

-- Now create clean policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role bypass" ON public.user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Grant proper permissions
GRANT ALL ON public.user_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- Drop the function if it exists with any signature
DROP FUNCTION IF EXISTS public.confirm_beta_tester_email(TEXT);

-- Create a helper function to manually confirm beta testers if needed
CREATE OR REPLACE FUNCTION public.confirm_beta_tester_email(user_email TEXT)
RETURNS void AS $$
BEGIN
  -- Only confirm if they're a beta tester
  IF EXISTS (
    SELECT 1 FROM public.beta_testers
    WHERE email = user_email
    AND status IN ('active', 'converted')
  ) THEN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_email(TEXT) TO service_role;

-- Show what triggers remain on auth.users
SELECT
    tgname as trigger_name,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
ORDER BY tgname;