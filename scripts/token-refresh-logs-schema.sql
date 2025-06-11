-- Create token refresh logs table for monitoring
CREATE TABLE IF NOT EXISTS token_refresh_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_ms INTEGER NOT NULL,
  total_processed INTEGER NOT NULL DEFAULT 0,
  successful_refreshes INTEGER NOT NULL DEFAULT 0,
  failed_refreshes INTEGER NOT NULL DEFAULT 0,
  skipped_refreshes INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  is_critical_failure BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_executed_at ON token_refresh_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_critical ON token_refresh_logs(is_critical_failure) WHERE is_critical_failure = TRUE;

-- Add columns to integrations table for better tracking
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS last_token_refresh TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP WITH TIME ZONE;

-- Create index for token refresh monitoring
CREATE INDEX IF NOT EXISTS idx_integrations_token_refresh ON integrations(status, expires_at, last_token_refresh) WHERE status = 'connected';

-- Create function to clean up old logs automatically
CREATE OR REPLACE FUNCTION cleanup_old_token_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM token_refresh_logs 
  WHERE executed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create a view for easy monitoring
CREATE OR REPLACE VIEW token_health_summary AS
SELECT 
  provider,
  COUNT(*) as total_integrations,
  COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW() + INTERVAL '1 hour') as healthy,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW() + INTERVAL '1 hour' AND expires_at > NOW()) as expiring_soon,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired,
  COUNT(*) FILTER (WHERE consecutive_failures >= 3) as failed,
  AVG(consecutive_failures) as avg_failures
FROM integrations 
WHERE status = 'connected'
GROUP BY provider
ORDER BY failed DESC, expired DESC, expiring_soon DESC;
