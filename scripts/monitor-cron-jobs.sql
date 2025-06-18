-- Monitor Cron Jobs and Token Health
-- Run this to check the status of your cron jobs and token refresh system

-- 1. Check currently scheduled cron jobs
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  created_at,
  -- Show next run time (approximate)
  CASE 
    WHEN schedule = '*/30 * * * *' THEN 'Every 30 minutes'
    WHEN schedule = '0 * * * *' THEN 'Every hour'
    WHEN schedule = '0 0 * * *' THEN 'Daily at midnight'
    ELSE schedule
  END as schedule_description
FROM cron.job 
ORDER BY created_at DESC;

-- 2. Check recent job executions (last 24 hours)
SELECT 
  jobname,
  runid,
  job_pid,
  status,
  start_time,
  end_time,
  -- Calculate duration
  CASE 
    WHEN end_time IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (end_time - start_time)) || ' seconds'
    WHEN status = 'running' THEN 
      EXTRACT(EPOCH FROM (NOW() - start_time)) || ' seconds (still running)'
    ELSE 'Unknown'
  END as duration,
  return_message
FROM cron.job_run_details 
WHERE start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC
LIMIT 20;

-- 3. Check for stuck/running jobs
SELECT 
  jobname,
  runid,
  job_pid,
  status,
  start_time,
  -- How long it's been running
  EXTRACT(EPOCH FROM (NOW() - start_time))/60 as minutes_running
FROM cron.job_run_details 
WHERE status = 'running'
ORDER BY start_time ASC;

-- 4. Check token refresh logs (last 24 hours)
SELECT 
  job_id,
  executed_at,
  status,
  duration_ms,
  total_processed,
  successful_refreshes,
  failed_refreshes,
  skipped_refreshes,
  error_count,
  is_critical_failure,
  failure_message
FROM token_refresh_logs 
WHERE executed_at > NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC
LIMIT 10;

-- 5. Show current token health summary
SELECT * FROM token_health_summary;

-- 6. Check integrations that need attention
SELECT 
  provider,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'connected') as connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  COUNT(*) FILTER (WHERE status = 'needs_reauthorization') as needs_reauth,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected,
  AVG(consecutive_failures) as avg_failures,
  MAX(consecutive_failures) as max_failures
FROM integrations 
GROUP BY provider
ORDER BY total DESC;

-- 7. Show integrations expiring soon (next 24 hours)
SELECT 
  id,
  provider,
  user_id,
  status,
  expires_at,
  consecutive_failures,
  last_token_refresh,
  -- Time until expiry
  CASE 
    WHEN expires_at IS NULL THEN 'No expiry set'
    WHEN expires_at < NOW() THEN 'EXPIRED'
    ELSE EXTRACT(EPOCH FROM (expires_at - NOW()))/3600 || ' hours remaining'
  END as time_until_expiry
FROM integrations 
WHERE status = 'connected'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW() + INTERVAL '24 hours'
ORDER BY expires_at ASC;

-- 8. Check for integrations with high failure counts
SELECT 
  id,
  provider,
  user_id,
  status,
  consecutive_failures,
  last_failure_at,
  last_token_refresh,
  expires_at
FROM integrations 
WHERE consecutive_failures >= 3
ORDER BY consecutive_failures DESC, last_failure_at DESC;

-- 9. Show recent activity (last 10 token refresh attempts)
SELECT 
  'Token Refresh' as activity_type,
  job_id,
  executed_at,
  status,
  CASE 
    WHEN status = 'completed' THEN '✅ Success'
    WHEN status = 'failed' THEN '❌ Failed'
    WHEN status = 'processing' THEN '🔄 Running'
    ELSE status
  END as status_display,
  total_processed || ' processed, ' || 
  successful_refreshes || ' success, ' || 
  failed_refreshes || ' failed' as summary
FROM token_refresh_logs 
WHERE executed_at > NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC
LIMIT 10; 