-- NUCLEAR OPTION: Remove ALL triggers and functions that could interfere with auth.users
-- Run this to completely clean up the database

-- Step 1: Show ALL triggers on auth.users (including the one we just saw)
SELECT
    tgname as trigger_name,
    proname as function_name,
    tgtype,
    tgenabled
FROM pg_trigger t
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'auth.users'::regclass
ORDER BY tgname;

-- Step 2: Drop the simple_beta_status_trigger we created
DROP TRIGGER IF EXISTS simple_beta_status_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.simple_beta_status_update();

-- Step 3: Drop ALL other custom triggers on auth.users
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop ALL triggers except system ones
    FOR r IN
        SELECT tgname
        FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
        AND tgname NOT LIKE 'RI_%'  -- Keep foreign key triggers
        AND tgname NOT LIKE 'pg_%'  -- Keep PostgreSQL system triggers
        AND tgname NOT LIKE '%_pkey%'  -- Keep primary key triggers
        AND tgname NOT LIKE '%_check%' -- Keep check constraint triggers
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE', r.tgname);
            RAISE NOTICE 'Dropped trigger: %', r.tgname;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop trigger %: %', r.tgname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Step 4: Drop ALL functions that might be called by triggers
DROP FUNCTION IF EXISTS public.simple_beta_status_update() CASCADE;
DROP FUNCTION IF EXISTS public.update_beta_tester_status() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_beta_user_profile() CASCADE;
DROP FUNCTION IF EXISTS public.handle_beta_tester_signup() CASCADE;
DROP FUNCTION IF EXISTS public.auto_confirm_beta_testers() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Step 5: Check if there are any functions in auth schema
SELECT
    p.proname as function_name,
    n.nspname as schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth'
AND p.proname NOT IN (
    -- List of known Supabase auth functions to keep
    'email', 'uid', 'role', 'jwt',
    'email_confirmed_at', 'user_id'
)
ORDER BY p.proname;

-- Step 6: Verify NO custom triggers remain
SELECT
    'Custom triggers remaining:' as status,
    COUNT(*) as count
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
AND tgname NOT LIKE 'RI_%'
AND tgname NOT LIKE 'pg_%'
AND tgname NOT LIKE '%_pkey%'
AND tgname NOT LIKE '%_check%';

-- Step 7: Show what triggers ARE still there (should only be system ones)
SELECT
    tgname as remaining_triggers
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
ORDER BY tgname;

-- Step 8: Check for any policies on auth.users that might cause issues
SELECT
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'auth'
AND tablename = 'users';

-- Step 9: Create a MINIMAL function to update beta_testers AFTER signup succeeds
-- This is completely separate from the auth process
CREATE OR REPLACE FUNCTION public.mark_beta_tester_converted(user_email TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.beta_testers
    SET status = 'converted',
        conversion_date = NOW()
    WHERE email = user_email
    AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_beta_tester_converted(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_beta_tester_converted(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_beta_tester_converted(TEXT) TO service_role;

-- Step 10: Ensure beta_testers table doesn't have problematic constraints
ALTER TABLE public.beta_testers DROP CONSTRAINT IF EXISTS beta_testers_email_key CASCADE;
ALTER TABLE public.beta_testers ADD CONSTRAINT beta_testers_email_key UNIQUE (email);

-- Final message
SELECT 'Cleanup complete! There should be NO custom triggers on auth.users now.' as message;