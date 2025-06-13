-- Add new columns to token_refresh_logs table for job tracking
ALTER TABLE IF EXISTS token_refresh_logs 
ADD COLUMN IF NOT EXISTS job_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create an index on job_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_job_id ON token_refresh_logs(job_id);

-- Create a summary table for quick status checks
CREATE TABLE IF NOT EXISTS token_refresh_summary (
  job_id TEXT PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  total_processed INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to check job status
CREATE OR REPLACE FUNCTION get_refresh_job_status(p_job_id TEXT)
RETURNS TABLE (
  job_id TEXT,
  status TEXT,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_processed INTEGER,
  successful INTEGER,
  failed INTEGER,
  skipped INTEGER,
  error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.job_id,
    l.status,
    l.executed_at,
    l.completed_at,
    l.duration_ms,
    l.total_processed,
    l.successful_refreshes as successful,
    l.failed_refreshes as failed,
    l.skipped_refreshes as skipped,
    l.error_message
  FROM token_refresh_logs l
  WHERE l.job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;
