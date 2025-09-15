-- IMMEDIATE FIX for user creation error
-- Run this FIRST to stop the error, then run the full setup if needed

-- Step 1: Check what triggers exist on auth.users
SELECT
    tgname as trigger_name,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass
ORDER BY tgname;

-- Step 2: Drop ALL problematic triggers that reference beta_testers
DROP TRIGGER IF EXISTS auto_add_beta_tester_on_signup ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 3: Drop functions that might reference beta_testers
DROP FUNCTION IF EXISTS public.auto_add_beta_tester() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Step 4: Create a MINIMAL safe function that only handles user_profiles
CREATE OR REPLACE FUNCTION public.handle_new_user_minimal()
RETURNS TRIGGER AS $$
BEGIN
    -- Only try to create user_profiles entry, nothing else
    BEGIN
        INSERT INTO public.user_profiles (id, created_at, updated_at)
        VALUES (NEW.id, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION
        WHEN OTHERS THEN
            -- If even this fails, just log and continue
            RAISE WARNING 'Could not create user_profiles entry: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the minimal trigger
CREATE TRIGGER on_auth_user_created_minimal
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_minimal();

-- Step 6: Verify the fix
SELECT
    'Triggers on auth.users' as check_item,
    COUNT(*) as count
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
UNION ALL
SELECT
    'Functions referencing beta_testers' as check_item,
    COUNT(*) as count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) LIKE '%beta_testers%'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Step 7: Test user creation (optional - uncomment to test)
/*
DO $$
DECLARE
    test_user_id uuid;
BEGIN
    -- Generate a unique test email
    DECLARE test_email text := 'test_' || extract(epoch from now())::text || '@example.com';

    -- Try to create a test user
    INSERT INTO auth.users (
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role
    ) VALUES (
        gen_random_uuid(),
        test_email,
        crypt('TestPassword123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        false,
        'authenticated'
    ) RETURNING id INTO test_user_id;

    RAISE NOTICE 'SUCCESS: Test user created with ID: %', test_user_id;

    -- Clean up test user
    DELETE FROM auth.users WHERE id = test_user_id;
    RAISE NOTICE 'Test user cleaned up';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR creating test user: %', SQLERRM;
END $$;
*/