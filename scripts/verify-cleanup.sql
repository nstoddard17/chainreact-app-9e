-- Verify Cleanup Results
-- Run this to confirm the cleanup worked and everything is running properly

-- 1. Check current cron jobs (should be only 1)
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '*/30 * * * *' THEN 'Every 30 minutes'
    ELSE schedule
  END as schedule_description
FROM cron.job 
ORDER BY jobid DESC;

-- 2. Check recent job executions (should be clean now)
SELECT 
  jobid,
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
      EXTRACT(EPOCH FROM (NOW() - start_time))/60 || ' minutes (still running)'
    ELSE 'Unknown'
  END as duration,
  return_message
FROM cron.job_run_details 
WHERE start_time > NOW() - INTERVAL '2 hours'
ORDER BY start_time DESC
LIMIT 10;

-- 3. Check for any stuck/running jobs (should be none)
SELECT 
  jobid,
  runid,
  job_pid,
  status,
  start_time,
  EXTRACT(EPOCH FROM (NOW() - start_time))/60 as minutes_running
FROM cron.job_run_details 
WHERE status = 'running'
ORDER BY start_time ASC;

-- 4. Check token refresh logs (should show recent activity)
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
  is_critical_failure
FROM token_refresh_logs 
WHERE executed_at > NOW() - INTERVAL '2 hours'
ORDER BY executed_at DESC
LIMIT 5;

-- 5. Show current token health
SELECT * FROM token_health_summary;

-- 6. Test the cron job manually (optional - uncomment to run)
-- SELECT http_get('https://chainreact.app/api/cron/refresh-tokens?secret=940a721f76f3e7f579edfb8010594bd962e93ba188aebaabee1f019b56ec1cc3');

-- 7. Check integrations that need attention
SELECT 
  provider,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'connected') as connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  COUNT(*) FILTER (WHERE status = 'needs_reauthorization') as needs_reauth,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected
FROM integrations 
GROUP BY provider
ORDER BY total DESC; 