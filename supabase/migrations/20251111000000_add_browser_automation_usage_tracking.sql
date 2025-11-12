-- Add browser automation usage tracking to user_profiles
-- This tracks usage for Extract Website Data node's premium features (dynamic content + screenshots)

-- Add columns to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS browser_automation_seconds_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS browser_automation_seconds_limit INTEGER DEFAULT 1800; -- 30 minutes (1800 seconds) for free users

-- Add index for efficient usage queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_browser_automation_usage
ON user_profiles(browser_automation_seconds_used, browser_automation_seconds_limit);

-- Add column to track last reset date (for monthly limits)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS browser_automation_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Create a function to reset usage monthly (for free users)
CREATE OR REPLACE FUNCTION reset_browser_automation_usage()
RETURNS void AS $$
BEGIN
  -- Reset usage for users whose reset date is more than 30 days old
  UPDATE user_profiles
  SET
    browser_automation_seconds_used = 0,
    browser_automation_reset_at = NOW()
  WHERE
    browser_automation_reset_at < NOW() - INTERVAL '30 days'
    AND subscription_tier IN ('free', 'trial'); -- Only reset for free/trial users, not Pro/Enterprise
END;
$$ LANGUAGE plpgsql;

-- Create a function to increment browser automation usage
CREATE OR REPLACE FUNCTION increment_browser_automation_usage(
  p_user_id UUID,
  p_seconds INTEGER
)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET browser_automation_seconds_used = COALESCE(browser_automation_seconds_used, 0) + p_seconds
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a table to log browser automation usage (for analytics)
CREATE TABLE IF NOT EXISTS browser_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  execution_id UUID,
  duration_seconds INTEGER NOT NULL,
  had_screenshot BOOLEAN DEFAULT FALSE,
  had_dynamic_content BOOLEAN DEFAULT FALSE,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for querying logs
CREATE INDEX IF NOT EXISTS idx_browser_automation_logs_user_id ON browser_automation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_browser_automation_logs_created_at ON browser_automation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_browser_automation_logs_workflow_id ON browser_automation_logs(workflow_id);

-- Add RLS policies for browser_automation_logs
ALTER TABLE browser_automation_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view own browser automation logs"
ON browser_automation_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can insert logs
CREATE POLICY "Service role can insert browser automation logs"
ON browser_automation_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.browser_automation_seconds_used IS 'Total seconds of browser automation used this billing period';
COMMENT ON COLUMN user_profiles.browser_automation_seconds_limit IS 'Monthly limit in seconds (1800 = 30 min for free, -1 = unlimited for Pro)';
COMMENT ON COLUMN user_profiles.browser_automation_reset_at IS 'Date when usage was last reset (monthly for free users)';
COMMENT ON TABLE browser_automation_logs IS 'Logs of browser automation usage for analytics and debugging';
