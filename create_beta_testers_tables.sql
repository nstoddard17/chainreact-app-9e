-- Create beta_testers table
CREATE TABLE IF NOT EXISTS beta_testers (
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

-- Create beta_tester_activity table
CREATE TABLE IF NOT EXISTS beta_tester_activity (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    beta_tester_id uuid REFERENCES beta_testers(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    activity_type text NOT NULL,
    activity_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Create beta_tester_feedback table
CREATE TABLE IF NOT EXISTS beta_tester_feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    beta_tester_id uuid REFERENCES beta_testers(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    feedback_type text DEFAULT 'general',
    subject text,
    message text NOT NULL,
    rating integer CHECK (rating >= 1 AND rating <= 5),
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers(email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers(status);
CREATE INDEX IF NOT EXISTS idx_beta_tester_activity_user ON beta_tester_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_tester_feedback_user ON beta_tester_feedback(user_id);

-- Enable RLS (safe to run multiple times)
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can manage beta testers" ON beta_testers;
DROP POLICY IF EXISTS "Admins can view activity" ON beta_tester_activity;
DROP POLICY IF EXISTS "Admins can view feedback" ON beta_tester_feedback;
DROP POLICY IF EXISTS "Beta testers can submit feedback" ON beta_tester_feedback;

-- Admin can do everything
CREATE POLICY "Admins can manage beta testers" ON beta_testers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can view activity" ON beta_tester_activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can view feedback" ON beta_tester_feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- Beta testers can submit feedback
CREATE POLICY "Beta testers can submit feedback" ON beta_tester_feedback
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'beta-pro'
        )
    );