-- Cleanup and Reset Cron Jobs Script
-- Run this in your Supabase SQL Editor to fix the multiple job issue

-- 1. First, let's see what cron jobs currently exist
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  created_at
FROM cron.job 
ORDER BY created_at DESC;

-- 2. Remove ALL existing cron jobs (this will stop all running jobs)
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN SELECT jobid, jobname FROM cron.job LOOP
    BEGIN
      PERFORM cron.unschedule(job_record.jobname);
      RAISE NOTICE 'Removed job: % (ID: %)', job_record.jobname, job_record.jobid;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Failed to remove job %: %', job_record.jobname, SQLERRM;
    END;
  END LOOP;
END $$;

-- 3. Clean up any stuck job runs
DELETE FROM cron.job_run_details 
WHERE status = 'running' 
AND start_time < NOW() - INTERVAL '1 hour';

-- 4. Verify all jobs are removed
SELECT 
  jobid,
  jobname,
  schedule,
  command
FROM cron.job;

-- 5. Now schedule ONLY ONE cron job (replace YOUR_CRON_SECRET with your actual secret)
-- IMPORTANT: Replace 'YOUR_CRON_SECRET' with your actual CRON_SECRET value
SELECT cron.schedule(
  'refresh-oauth-tokens',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT http_get('https://chainreact.app/api/cron/refresh-tokens?secret=YOUR_CRON_SECRET');
  $$
);

-- 6. Verify the single job is scheduled
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  created_at
FROM cron.job 
WHERE jobname = 'refresh-oauth-tokens';

-- 7. Check for any recent job runs to confirm cleanup
SELECT 
  jobname,
  runid,
  job_pid,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details 
WHERE start_time > NOW() - INTERVAL '1 hour'
ORDER BY start_time DESC;

-- 8. Show current token health status
SELECT * FROM token_health_summary;

-- 9. Check for any stuck integrations
SELECT 
  id,
  provider,
  user_id,
  status,
  expires_at,
  consecutive_failures,
  last_token_refresh,
  updated_at
FROM integrations 
WHERE status IN ('connected', 'expired', 'needs_reauthorization')
ORDER BY expires_at ASC NULLS LAST; 