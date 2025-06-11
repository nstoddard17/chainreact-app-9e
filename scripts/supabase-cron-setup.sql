-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to call the edge function
CREATE OR REPLACE FUNCTION call_token_refresh()
RETURNS void AS $$
DECLARE
  result json;
BEGIN
  SELECT INTO result
    content::json
  FROM
    http((
      'GET',
      'https://your-project-ref.supabase.co/functions/v1/refresh-tokens',
      ARRAY[
        ('Authorization', 'Bearer YOUR_CRON_SECRET')::http_header
      ],
      NULL,
      NULL
    )::http_request);
  
  -- Log the result
  INSERT INTO cron_job_logs (job_name, result, executed_at)
  VALUES ('token_refresh', result::text, NOW());
END;
$$ LANGUAGE plpgsql;

-- Create a table to store logs
CREATE TABLE IF NOT EXISTS cron_job_logs (
  id SERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  result TEXT,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schedule the job to run every 2 hours
SELECT cron.schedule('0 */30 * * * *', $$SELECT call_token_refresh()$$);

-- To view scheduled jobs
SELECT * FROM cron.job;

-- To view job logs
SELECT * FROM cron_job_logs ORDER BY executed_at DESC LIMIT 10;
