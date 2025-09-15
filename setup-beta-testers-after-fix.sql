-- SETUP BETA TESTERS TABLE
-- Run this AFTER fix-user-creation-immediate.sql if you want beta testers functionality

-- Step 1: Create the beta_testers table (safe - won't error if exists)
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

-- Step 2: Create related tables
CREATE TABLE IF NOT EXISTS public.beta_tester_activity (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    beta_tester_id uuid REFERENCES beta_testers(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    activity_type text NOT NULL,
    activity_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);

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

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers(email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers(status);
CREATE INDEX IF NOT EXISTS idx_beta_tester_activity_user ON beta_tester_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_tester_feedback_user ON beta_tester_feedback(user_id);

-- Step 4: Enable RLS
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_feedback ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies
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

-- Step 6: NOW we can update the trigger to include beta_testers (OPTIONAL)
-- Uncomment this section if you want to auto-add new users to beta_testers
/*
DROP FUNCTION IF EXISTS public.handle_new_user_with_beta() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user_with_beta()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user_profiles entry
    INSERT INTO public.user_profiles (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    -- Try to add to beta_testers (with error handling)
    BEGIN
        INSERT INTO public.beta_testers (email, status, notes)
        SELECT NEW.email, 'pending', 'Auto-added on signup'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.beta_testers WHERE email = NEW.email
        );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Could not add to beta_testers: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the minimal trigger with the beta-aware one
DROP TRIGGER IF EXISTS on_auth_user_created_minimal ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_with_beta();
*/

-- Step 7: Verify setup
SELECT
    'beta_testers table' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'beta_testers')
         THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'beta_tester_activity table' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'beta_tester_activity')
         THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'beta_tester_feedback table' as component,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'beta_tester_feedback')
         THEN 'EXISTS' ELSE 'MISSING' END as status;