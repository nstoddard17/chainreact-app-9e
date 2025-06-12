-- Test the cron job endpoints using Supabase SQL Editor

-- 1. First, let's check what integrations we have
SELECT 
  id,
  provider,
  user_id,
  status,
  expires_at,
  last_token_refresh,
  consecutive_failures,
  created_at,
  updated_at
FROM integrations 
WHERE status = 'connected'
ORDER BY provider, created_at;

-- 2. Test the debug endpoint (no auth required)
SELECT 
  status,
  content::json->'success' as success,
  content::json->'analysis' as analysis,
  content::json->'sampleIntegrations' as sample_integrations
FROM http_get('https://chainreact.app/api/cron/debug-integrations');

-- 3. Test the refresh endpoint (no auth required)
SELECT 
  status,
  content::json->'success' as success,
  content::json->'results' as results,
  content::json->'duration' as duration
FROM http_get('https://chainreact.app/api/cron/test-refresh');

-- 4. Run the actual cron job (replace YOUR_CRON_SECRET with your actual secret)
-- IMPORTANT: Replace 'YOUR_CRON_SECRET' with your actual CRON_SECRET value
SELECT 
  status,
  content::json->'success' as success,
  content::json->'stats' as stats,
  content::json->'duration' as duration,
  content::json->'message' as message
FROM http_get('https://chainreact.app/api/cron/refresh-tokens?secret=YOUR_CRON_SECRET');

-- 5. Check if integrations were updated after running the cron job
SELECT 
  id,
  provider,
  user_id,
  status,
  expires_at,
  last_token_refresh,
  consecutive_failures,
  updated_at,
  -- Show how long until expiration
  CASE 
    WHEN expires_at IS NULL THEN 'No expiration set'
    WHEN expires_at < NOW() THEN 'EXPIRED'
    ELSE EXTRACT(EPOCH FROM (expires_at - NOW()))/3600 || ' hours remaining'
  END as time_until_expiry
FROM integrations 
WHERE status = 'connected'
ORDER BY expires_at ASC NULLS LAST;

-- 6. Check the refresh logs (if the table exists)
SELECT 
  executed_at,
  duration_ms,
  total_processed,
  successful_refreshes,
  failed_refreshes,
  skipped_refreshes,
  error_count,
  errors,
  is_critical_failure
FROM token_refresh_logs 
ORDER BY executed_at DESC 
LIMIT 10;

-- 7. Set up automatic cron job (run this once to schedule)
-- This will run every 30 minutes
-- IMPORTANT: Replace 'YOUR_CRON_SECRET' with your actual CRON_SECRET value
SELECT cron.schedule(
  'refresh-oauth-tokens',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT http_get('https://chainreact.app/api/cron/refresh-tokens?secret=YOUR_CRON_SECRET');
  $$
);

-- 8. Check scheduled cron jobs
SELECT * FROM cron.job ORDER BY created_at DESC;

-- 9. Check cron job execution history
SELECT 
  jobname,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
WHERE jobname = 'refresh-oauth-tokens'
ORDER BY start_time DESC 
LIMIT 10;

-- 10. To remove the cron job if needed (uncomment to use)
-- SELECT cron.unschedule('refresh-oauth-tokens');
