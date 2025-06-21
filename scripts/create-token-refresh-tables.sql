-- Create token_refresh_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS token_refresh_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'started', 'completed', 'failed'
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_processed INTEGER,
  successful INTEGER,
  failed INTEGER,
  skipped INTEGER,
  recovered INTEGER,
  attempts INTEGER,
  errors JSONB,
  is_critical_failure BOOLEAN DEFAULT FALSE
);

-- Create token_refresh_attempts table to track individual refresh attempts
CREATE TABLE IF NOT EXISTS token_refresh_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id TEXT NOT NULL,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL, -- 1, 2, 3, etc.
  provider TEXT NOT NULL,
  status TEXT NOT NULL, -- 'started', 'success', 'failed', 'error'
  message TEXT,
  refreshed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS token_refresh_logs_job_id_idx ON token_refresh_logs(job_id);
CREATE INDEX IF NOT EXISTS token_refresh_attempts_job_id_idx ON token_refresh_attempts(job_id);
CREATE INDEX IF NOT EXISTS token_refresh_attempts_integration_id_idx ON token_refresh_attempts(integration_id);
CREATE INDEX IF NOT EXISTS token_refresh_attempts_provider_idx ON token_refresh_attempts(provider);

-- Create helpful view to analyze token refresh performance
CREATE OR REPLACE VIEW token_refresh_analysis AS
SELECT
  l.job_id,
  l.status AS job_status,
  l.started_at,
  l.completed_at,
  l.duration_ms,
  l.total_processed,
  l.successful,
  l.failed,
  l.recovered,
  l.attempts AS total_attempts,
  COUNT(a.id) AS tracked_attempts,
  SUM(CASE WHEN a.status = 'success' THEN 1 ELSE 0 END) AS successful_attempts,
  SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) AS failed_attempts,
  SUM(CASE WHEN a.status = 'error' THEN 1 ELSE 0 END) AS error_attempts,
  array_agg(DISTINCT a.provider) AS providers_processed
FROM 
  token_refresh_logs l
LEFT JOIN
  token_refresh_attempts a ON l.job_id = a.job_id
GROUP BY
  l.id, l.job_id, l.status, l.started_at, l.completed_at, l.duration_ms, l.total_processed, l.successful, l.failed, l.recovered, l.attempts
ORDER BY
  l.started_at DESC;

-- Create function to get token refresh statistics
CREATE OR REPLACE FUNCTION get_token_refresh_stats(days_back integer DEFAULT 7)
RETURNS TABLE (
  day date,
  total_jobs integer,
  successful_jobs integer,
  failed_jobs integer,
  integrations_processed integer,
  successful_refreshes integer,
  failed_refreshes integer,
  recovered_integrations integer,
  avg_duration_ms numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(l.started_at) AS day,
    COUNT(DISTINCT l.job_id) AS total_jobs,
    COUNT(DISTINCT CASE WHEN l.status = 'completed' THEN l.job_id END) AS successful_jobs,
    COUNT(DISTINCT CASE WHEN l.status = 'failed' THEN l.job_id END) AS failed_jobs,
    SUM(l.total_processed) AS integrations_processed,
    SUM(l.successful) AS successful_refreshes,
    SUM(l.failed) AS failed_refreshes,
    SUM(l.recovered) AS recovered_integrations,
    AVG(l.duration_ms) AS avg_duration_ms
  FROM
    token_refresh_logs l
  WHERE
    l.started_at >= NOW() - (days_back || ' days')::interval
  GROUP BY
    DATE(l.started_at)
  ORDER BY
    day DESC;
END;
$$ LANGUAGE plpgsql; 