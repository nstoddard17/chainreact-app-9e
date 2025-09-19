-- Remove ALL user creation triggers that might be causing issues
-- We'll handle profile creation entirely from the client side

-- Drop all potentially problematic triggers
DROP TRIGGER IF EXISTS handle_beta_tester_signup_trigger ON auth.users;
DROP TRIGGER IF EXISTS auto_confirm_beta_testers_trigger ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- Drop all related functions
DROP FUNCTION IF EXISTS public.handle_beta_tester_signup();
DROP FUNCTION IF EXISTS public.auto_confirm_beta_testers();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.confirm_beta_tester_after_signup(TEXT);

-- Ensure the user_profiles table exists with proper structure
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);

-- Ensure proper permissions
GRANT ALL ON public.user_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- Remove any RLS policies that might interfere
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Show current state to verify
SELECT
    'Triggers on auth.users' as check_type,
    tgname as name
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
UNION ALL
SELECT
    'Functions that might affect users' as check_type,
    proname as name
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname LIKE '%user%' OR proname LIKE '%beta%';