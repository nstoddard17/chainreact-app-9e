-- Fix auth.users table functions and triggers
-- This script removes references to non-existent beta_testers table

-- Step 1: Drop the problematic trigger if it exists
DROP TRIGGER IF EXISTS auto_add_beta_tester_on_signup ON auth.users;

-- Step 2: Drop the function that references beta_testers
DROP FUNCTION IF EXISTS public.auto_add_beta_tester();

-- Step 3: Check for and drop any other triggers that might reference beta_testers
DO $$
BEGIN
    -- List all triggers on auth.users that might be causing issues
    FOR r IN
        SELECT tgname
        FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
        AND tgname LIKE '%beta%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
    END LOOP;
END $$;

-- Step 4: Create a safe user creation trigger that doesn't reference beta_testers
-- This creates a user_profiles entry when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create user_profiles entry, no beta_testers reference
    INSERT INTO public.user_profiles (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the trigger for new user signup (if it doesn't exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 6: Verify no functions reference beta_testers
-- This lists any functions that might still reference the table
SELECT
    n.nspname as schema,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) LIKE '%beta_testers%'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Step 7: Clean up any orphaned beta_testers references in RLS policies
-- Check if any policies reference beta_testers
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE qual::text LIKE '%beta_testers%'
   OR with_check::text LIKE '%beta_testers%';

-- Step 8: If you want to recreate the beta_testers table properly, uncomment below:
/*
-- Create beta_testers table
CREATE TABLE IF NOT EXISTS public.beta_testers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text UNIQUE NOT NULL,
    status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'revoked')),
    added_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    added_by uuid REFERENCES auth.users(id),
    notes text,
    max_workflows integer DEFAULT 50,
    max_executions_per_month integer DEFAULT 5000,
    max_integrations integer DEFAULT 30,
    conversion_offer_sent_at timestamp with time zone,
    converted_to_paid_at timestamp with time zone,
    last_active_at timestamp with time zone,
    total_workflows_created integer DEFAULT 0,
    total_executions integer DEFAULT 0,
    feedback_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers(email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers(status);

-- Enable RLS
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;

-- Create admin policy
CREATE POLICY "Admins can manage beta testers" ON beta_testers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );
*/

-- Step 9: Test user creation (optional - uncomment to test)
/*
-- This should work without errors now
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
    'test@example.com',
    crypt('TestPassword123!', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    false,
    'authenticated'
) RETURNING id, email;
*/

-- Step 10: Show current triggers on auth.users
SELECT
    tgname AS trigger_name,
    proname AS function_name,
    tgenabled AS enabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass
ORDER BY tgname;