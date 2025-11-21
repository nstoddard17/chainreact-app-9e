-- Create error_reports table for tracking test failures and user reports
CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  node_type TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  config JSONB,
  user_description TEXT,
  user_email TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on created_at for sorting recent reports
CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at DESC);

-- Create index on provider_id for filtering by provider
CREATE INDEX IF NOT EXISTS idx_error_reports_provider_id ON error_reports(provider_id);

-- Create index on error_code for grouping similar errors
CREATE INDEX IF NOT EXISTS idx_error_reports_error_code ON error_reports(error_code);

-- Add RLS policies
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all reports
CREATE POLICY "Service role can manage error_reports"
  ON error_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Note: Regular users should NOT be able to see other users' error reports
-- Only service role (backend API) can access these

COMMENT ON TABLE error_reports IS 'Stores error reports from failed action/trigger tests during workflow configuration';
COMMENT ON COLUMN error_reports.error_code IS 'Error code (e.g., TEST_FAILED, INVALID_CHANNEL)';
COMMENT ON COLUMN error_reports.error_message IS 'Human-readable error message';
COMMENT ON COLUMN error_reports.error_details IS 'Additional error details from API responses';
COMMENT ON COLUMN error_reports.node_type IS 'Type of node that failed (e.g., slack_action_send_message)';
COMMENT ON COLUMN error_reports.provider_id IS 'Provider ID (e.g., slack, gmail)';
COMMENT ON COLUMN error_reports.config IS 'Sanitized node configuration (no tokens/secrets)';
COMMENT ON COLUMN error_reports.user_description IS 'Optional user-provided description of what they were trying to do';
COMMENT ON COLUMN error_reports.user_email IS 'Optional user email for follow-up';
COMMENT ON COLUMN error_reports.user_agent IS 'Browser user agent string for debugging';
