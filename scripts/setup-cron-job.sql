-- Complete Cron Job Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Create token refresh logs table
CREATE TABLE IF NOT EXISTS token_refresh_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'started',
  duration_ms INTEGER NOT NULL,
  total_processed INTEGER NOT NULL DEFAULT 0,
  successful_refreshes INTEGER NOT NULL DEFAULT 0,
  failed_refreshes INTEGER NOT NULL DEFAULT 0,
  skipped_refreshes INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  is_critical_failure BOOLEAN DEFAULT FALSE,
  failure_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_executed_at ON token_refresh_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_critical ON token_refresh_logs(is_critical_failure) WHERE is_critical_failure = TRUE;
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_job_id ON token_refresh_logs(job_id);

-- 3. Add columns to integrations table for better tracking
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS last_token_refresh TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS disconnect_reason TEXT;

-- 4. Create index for token refresh monitoring
CREATE INDEX IF NOT EXISTS idx_integrations_token_refresh ON integrations(status, expires_at, last_token_refresh) WHERE status = 'connected';

-- 5. Create function to clean up old logs automatically
CREATE OR REPLACE FUNCTION cleanup_old_token_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM token_refresh_logs 
  WHERE executed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 6. Create a view for easy monitoring
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

-- 7. Remove existing cron job if it exists (with error handling)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-oauth-tokens');
EXCEPTION
  WHEN OTHERS THEN
    -- Job doesn't exist, which is fine
    NULL;
END $$;

-- 8. Schedule the new cron job (replace YOUR_CRON_SECRET with your actual secret)
-- IMPORTANT: Replace 'YOUR_CRON_SECRET' with your actual CRON_SECRET value
SELECT cron.schedule(
  'refresh-oauth-tokens',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT http_get('https://chainreact.app/api/cron/refresh-tokens?secret=YOUR_CRON_SECRET');
  $$
);

-- 9. Verify the setup
SELECT 'Cron job setup complete!' as status;

-- 10. Check if the job is scheduled
SELECT 
  jobid,
  jobname,
  schedule,
  command
FROM cron.job 
WHERE jobname = 'refresh-oauth-tokens';

-- 11. Show current token health
SELECT * FROM token_health_summary;

-- Check total number of integrations
SELECT 
  provider,
  status,
  COUNT(*) as count
FROM integrations 
GROUP BY provider, status
ORDER BY count DESC;

-- Total count
SELECT 
  COUNT(*) as total_integrations,
  COUNT(*) FILTER (WHERE status = 'connected') as connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  COUNT(*) FILTER (WHERE status = 'needs_reauthorization') as needs_reauth,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected
FROM integrations; 