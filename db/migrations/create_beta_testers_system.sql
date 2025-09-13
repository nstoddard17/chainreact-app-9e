-- Beta Testers Management System
-- This migration creates the complete beta testing infrastructure

-- 1. Create beta_testers table for managing beta access
CREATE TABLE IF NOT EXISTS beta_testers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'revoked')),

  -- Beta access details
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'), -- 3 month default
  added_by UUID REFERENCES auth.users(id),

  -- Limits for this beta tester (NULL means use defaults)
  max_workflows INT,
  max_executions_per_month INT,
  max_integrations INT,

  -- Tracking and notes
  notes TEXT,
  conversion_offer_sent_at TIMESTAMP WITH TIME ZONE,
  converted_to_paid_at TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE,

  -- Metadata for tracking
  total_workflows_created INT DEFAULT 0,
  total_executions INT DEFAULT 0,
  feedback_count INT DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create beta_tester_activity table for tracking usage
CREATE TABLE IF NOT EXISTS beta_tester_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  beta_tester_id UUID REFERENCES beta_testers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('signup', 'login', 'workflow_created', 'workflow_executed', 'feedback_submitted', 'converted')),
  activity_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create beta_tester_feedback table
CREATE TABLE IF NOT EXISTS beta_tester_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  beta_tester_id UUID REFERENCES beta_testers(id),
  feedback_type TEXT CHECK (feedback_type IN ('bug', 'feature_request', 'general', 'testimonial')),
  subject TEXT,
  message TEXT NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX idx_beta_testers_email ON beta_testers(email);
CREATE INDEX idx_beta_testers_status ON beta_testers(status);
CREATE INDEX idx_beta_testers_expires_at ON beta_testers(expires_at);
CREATE INDEX idx_beta_tester_activity_user ON beta_tester_activity(user_id);
CREATE INDEX idx_beta_tester_activity_type ON beta_tester_activity(activity_type);

-- 5. Create function to check if email is beta tester
CREATE OR REPLACE FUNCTION is_beta_tester(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM beta_testers
    WHERE email = user_email
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to assign beta role on signup
CREATE OR REPLACE FUNCTION assign_beta_role_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  beta_record RECORD;
BEGIN
  -- Check if the new user's email is in beta_testers table
  SELECT * INTO beta_record
  FROM beta_testers
  WHERE email = NEW.email
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > NOW());

  IF FOUND THEN
    -- Update or insert profile with beta-pro role
    INSERT INTO profiles (id, role, created_at, updated_at)
    VALUES (NEW.id, 'beta-pro', NOW(), NOW())
    ON CONFLICT (id)
    DO UPDATE SET role = 'beta-pro', updated_at = NOW();

    -- Log the signup activity
    INSERT INTO beta_tester_activity (
      beta_tester_id,
      user_id,
      activity_type,
      activity_data
    ) VALUES (
      beta_record.id,
      NEW.id,
      'signup',
      jsonb_build_object('email', NEW.email, 'timestamp', NOW())
    );

    -- Update last_active_at
    UPDATE beta_testers
    SET last_active_at = NOW()
    WHERE id = beta_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for auto-assignment on signup
DROP TRIGGER IF EXISTS on_auth_user_created_beta_check ON auth.users;
CREATE TRIGGER on_auth_user_created_beta_check
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_beta_role_on_signup();

-- 8. Create function to handle beta expiration
CREATE OR REPLACE FUNCTION process_expired_beta_testers()
RETURNS void AS $$
BEGIN
  -- Mark expired beta testers
  UPDATE beta_testers
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

  -- Downgrade expired beta users to free
  UPDATE profiles p
  SET role = 'free',
      updated_at = NOW()
  FROM beta_testers bt
  JOIN auth.users u ON u.email = bt.email
  WHERE p.id = u.id
  AND bt.status = 'expired'
  AND p.role = 'beta-pro';
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to convert beta tester to paid
CREATE OR REPLACE FUNCTION convert_beta_to_paid(beta_email TEXT)
RETURNS void AS $$
BEGIN
  -- Update beta_testers record
  UPDATE beta_testers
  SET status = 'converted',
      converted_to_paid_at = NOW(),
      updated_at = NOW()
  WHERE email = beta_email;

  -- Log conversion activity
  INSERT INTO beta_tester_activity (
    beta_tester_id,
    user_id,
    activity_type,
    activity_data
  )
  SELECT
    bt.id,
    u.id,
    'converted',
    jsonb_build_object('timestamp', NOW())
  FROM beta_testers bt
  JOIN auth.users u ON u.email = bt.email
  WHERE bt.email = beta_email;
END;
$$ LANGUAGE plpgsql;

-- 10. Add RLS policies
ALTER TABLE beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_tester_feedback ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage beta_testers" ON beta_testers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view beta_tester_activity" ON beta_tester_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Users can submit their own feedback
CREATE POLICY "Users can submit feedback" ON beta_tester_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback" ON beta_tester_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback" ON beta_tester_feedback
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 11. Insert some example beta testers (commented out, uncomment to use)
-- INSERT INTO beta_testers (email, notes, max_workflows, max_executions_per_month) VALUES
-- ('john@beta-company.com', 'Initial beta tester', 50, 5000),
-- ('sarah@testusers.com', 'Power user for stress testing', 100, 10000),
-- ('mike@earlyaccess.com', 'Feature feedback specialist', 30, 3000);