-- COMPLETE CLEANUP OF ALL TRIGGERS AND FUNCTIONS
-- This will remove ALL custom triggers on auth.users to fix the 500 error

-- Step 1: Show all existing triggers on auth.users (for debugging)
SELECT
    tgname as trigger_name,
    proname as function_name,
    tgtype
FROM pg_trigger t
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'  -- Exclude foreign key triggers
AND tgname NOT LIKE 'pg_%'  -- Exclude system triggers
ORDER BY tgname;

-- Step 2: Drop ALL custom triggers on auth.users
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all non-system triggers on auth.users
    FOR r IN
        SELECT tgname
        FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
        AND tgname NOT LIKE 'RI_%'  -- Keep foreign key triggers
        AND tgname NOT LIKE 'pg_%'  -- Keep system triggers
        AND tgisinternal = false    -- Only drop user-created triggers
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
        RAISE NOTICE 'Dropped trigger: %', r.tgname;
    END LOOP;
END $$;

-- Step 3: Drop ALL custom functions that might be related to user creation
DROP FUNCTION IF EXISTS public.ensure_beta_user_profile() CASCADE;
DROP FUNCTION IF EXISTS public.handle_beta_tester_signup() CASCADE;
DROP FUNCTION IF EXISTS public.auto_confirm_beta_testers() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.confirm_beta_tester_after_signup(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.fix_beta_user_profile(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.update_beta_tester_status() CASCADE;

-- Step 4: Drop any functions in auth schema that might interfere
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop custom functions in auth schema
    FOR r IN
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc
        WHERE pronamespace = 'auth'::regnamespace
        AND proname IN (
            'handle_new_user',
            'handle_beta_tester',
            'auto_confirm_beta',
            'ensure_profile'
        )
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS auth.%I(%s) CASCADE', r.proname, r.args);
        RAISE NOTICE 'Dropped function: auth.%(%)', r.proname, r.args;
    END LOOP;
END $$;

-- Step 5: Ensure user_profiles table has correct structure without constraints that could cause issues
ALTER TABLE IF EXISTS public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_username_key CASCADE;

ALTER TABLE IF EXISTS public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_id_fkey CASCADE;

-- Recreate the table with proper constraints
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY,
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

-- Add foreign key back but with CASCADE to prevent issues
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- Step 6: Fix RLS policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'user_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', r.policyname);
    END LOOP;
END $$;

-- Create simple, working policies
CREATE POLICY "Enable read for users" ON public.user_profiles
    FOR SELECT USING (true);  -- Allow all reads temporarily for debugging

CREATE POLICY "Enable insert for users" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update for users" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Step 7: Grant proper permissions
GRANT ALL ON public.user_profiles TO postgres;
GRANT ALL ON public.user_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;

-- Step 8: Create a VERY SIMPLE function for beta tester status update
-- This function does NOT touch auth.users at all
CREATE OR REPLACE FUNCTION public.simple_beta_status_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if user is beta tester and update beta_testers table
  -- Do NOT modify auth.users or create profiles
  IF NEW.raw_user_meta_data IS NOT NULL
     AND (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true THEN

    -- Just update the beta_testers table
    UPDATE public.beta_testers
    SET status = 'converted',
        conversion_date = NOW()
    WHERE email = NEW.email
    AND status = 'active';
  END IF;

  -- Always return NEW without modifications
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger AFTER insert to avoid any conflicts
CREATE TRIGGER simple_beta_status_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.simple_beta_status_update();

-- Step 9: Create helper function for email confirmation (called from client)
DROP FUNCTION IF EXISTS public.confirm_beta_tester_email(TEXT);

CREATE FUNCTION public.confirm_beta_tester_email(user_email TEXT)
RETURNS void AS $$
BEGIN
  -- Update email confirmation if user is a beta tester
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
  WHERE email = user_email
  AND EXISTS (
    SELECT 1 FROM public.beta_testers
    WHERE email = user_email
    AND status IN ('active', 'converted')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_email(TEXT) TO service_role;

-- Step 10: Verify cleanup was successful
SELECT
    'Remaining triggers on auth.users:' as check,
    COUNT(*) as count
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'
AND tgname NOT LIKE 'pg_%'
AND tgisinternal = false;

-- Show any remaining triggers for review
SELECT
    tgname as trigger_name,
    proname as function_name
FROM pg_trigger t
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'
AND tgname NOT LIKE 'pg_%'
ORDER BY tgname;