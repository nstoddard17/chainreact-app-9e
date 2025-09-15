-- Fix auth.users table functions while preserving beta_testers functionality
-- This script ensures beta_testers table exists and fixes the triggers

-- Step 1: First, drop the problematic trigger temporarily
DROP TRIGGER IF EXISTS auto_add_beta_tester_on_signup ON auth.users;
DROP FUNCTION IF EXISTS public.auto_add_beta_tester() CASCADE;

-- Step 2: Ensure beta_testers table exists (won't error if it already exists)
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

-- Step 3: Ensure beta_tester_activity table exists
CREATE TABLE IF NOT EXISTS public.beta_tester_activity (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    beta_tester_id uuid REFERENCES beta_testers(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    activity_type text NOT NULL,
    activity_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Step 4: Ensure beta_tester_feedback table exists
CREATE TABLE IF NOT EXISTS public.beta_tester_feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    beta_tester_id uuid REFERENCES beta_testers(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    feedback_type text DEFAULT 'general',
    subject text,
    message text NOT NULL,
    rating integer CHECK (rating >= 1 AND rating <= 5),
    created_at timestamp with time zone DEFAULT now()
);

-- Step 5: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers(email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers(status);
CREATE INDEX IF NOT EXISTS idx_beta_tester_activity_user ON beta_tester_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_tester_feedback_user ON beta_tester_feedback(user_id);

-- Step 6: Enable RLS
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_feedback ENABLE ROW LEVEL SECURITY;

-- Step 7: Create/replace RLS policies
DROP POLICY IF EXISTS "Admins can manage beta testers" ON beta_testers;
CREATE POLICY "Admins can manage beta testers" ON beta_testers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view activity" ON beta_tester_activity;
CREATE POLICY "Admins can view activity" ON beta_tester_activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view feedback" ON beta_tester_feedback;
CREATE POLICY "Admins can view feedback" ON beta_tester_feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Beta testers can submit feedback" ON beta_tester_feedback;
CREATE POLICY "Beta testers can submit feedback" ON beta_tester_feedback
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'beta-pro'
        )
    );

-- Step 8: Create a SAFE version of the auto-add function that handles errors
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Always create user_profiles entry
    INSERT INTO public.user_profiles (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    -- Optionally add to beta_testers (wrapped in exception handler)
    -- Comment out this block if you don't want auto-add to beta_testers
    BEGIN
        -- Only auto-add if email doesn't already exist in beta_testers
        INSERT INTO public.beta_testers (email, status, notes)
        SELECT NEW.email, 'pending', 'Auto-added on signup'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.beta_testers WHERE email = NEW.email
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log the error but don't fail the user creation
            RAISE WARNING 'Could not add user to beta_testers: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create the trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 10: Create a function to manually add a user to beta testers (for admin use)
CREATE OR REPLACE FUNCTION public.add_user_to_beta_testers(
    user_email text,
    user_status text DEFAULT 'active',
    user_notes text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    beta_tester_id uuid;
BEGIN
    INSERT INTO public.beta_testers (email, status, notes, added_by)
    VALUES (user_email, user_status, user_notes, auth.uid())
    ON CONFLICT (email) DO UPDATE
    SET
        status = EXCLUDED.status,
        notes = COALESCE(EXCLUDED.notes, beta_testers.notes),
        updated_at = NOW()
    RETURNING id INTO beta_tester_id;

    RETURN beta_tester_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Create a view for the admin panel
CREATE OR REPLACE VIEW public.beta_testers_admin_view AS
SELECT
    bt.*,
    up.full_name,
    up.avatar_url,
    up.role as user_role,
    au.last_sign_in_at,
    au.created_at as user_created_at,
    (
        SELECT COUNT(*)
        FROM workflows w
        WHERE w.user_id = au.id
    ) as actual_workflows_count,
    (
        SELECT COUNT(*)
        FROM workflow_executions we
        WHERE we.user_id = au.id
        AND we.started_at >= NOW() - INTERVAL '30 days'
    ) as executions_last_30_days
FROM public.beta_testers bt
LEFT JOIN auth.users au ON au.email = bt.email
LEFT JOIN public.user_profiles up ON up.id = au.id
ORDER BY bt.created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.beta_testers_admin_view TO authenticated;

-- Step 12: Test that user creation works
-- Uncomment to test:
/*
DO $$
DECLARE
    test_user_id uuid;
BEGIN
    -- Test creating a user
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
        'test_' || extract(epoch from now())::text || '@example.com',
        crypt('TestPassword123!', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        false,
        'authenticated'
    ) RETURNING id INTO test_user_id;

    RAISE NOTICE 'Test user created successfully with ID: %', test_user_id;

    -- Clean up test user
    DELETE FROM auth.users WHERE id = test_user_id;
    RAISE NOTICE 'Test user cleaned up';
END $$;
*/

-- Step 13: Show current status
SELECT
    'beta_testers table' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'beta_testers')
         THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'user_profiles table' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles')
         THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'handle_new_user function' as component,
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user')
         THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'on_auth_user_created trigger' as component,
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')
         THEN 'EXISTS' ELSE 'MISSING' END as status;