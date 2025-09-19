-- Fix RLS policies for user_profiles table
-- This will allow proper access while maintaining security

-- First, ensure RLS is enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
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

-- Create proper RLS policies for user_profiles
CREATE POLICY "Users can view their own profile"
ON public.user_profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.user_profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.user_profiles
FOR UPDATE
USING (auth.uid() = id);

-- IMPORTANT: Allow anonymous users to check username availability
-- This is needed for the signup page
CREATE POLICY "Anyone can check username availability"
ON public.user_profiles
FOR SELECT
USING (true);  -- This allows all SELECT operations

-- Service role bypasses all RLS
CREATE POLICY "Service role full access"
ON public.user_profiles
FOR ALL
USING (auth.role() = 'service_role');

-- Now set up RLS for beta_testers table
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies on beta_testers
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'beta_testers'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.beta_testers', r.policyname);
    END LOOP;
END $$;

-- Create policies for beta_testers
CREATE POLICY "Service role can do everything"
ON public.beta_testers
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can view their own beta status"
ON public.beta_testers
FOR SELECT
USING (
    auth.uid() IS NOT NULL
    AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Allow anonymous access for signup validation
CREATE POLICY "Anonymous can check beta status for signup"
ON public.beta_testers
FOR SELECT
USING (true);  -- Allow reading for signup validation

-- Grant proper permissions
GRANT ALL ON public.user_profiles TO service_role;
GRANT SELECT ON public.user_profiles TO anon;  -- Allow anonymous to check usernames
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

GRANT ALL ON public.beta_testers TO service_role;
GRANT SELECT ON public.beta_testers TO anon;  -- Allow anonymous to validate invites
GRANT SELECT ON public.beta_testers TO authenticated;

-- Verify policies are in place
SELECT
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'beta_testers')
ORDER BY tablename, policyname;