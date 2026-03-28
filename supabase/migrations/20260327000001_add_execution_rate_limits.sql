-- Add rate limit configuration columns to workflows table
-- These allow per-workflow customization of execution limits
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS max_executions_per_hour INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_executions_per_minute INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS consecutive_failure_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS circuit_breaker_tripped_at TIMESTAMPTZ;

-- Add index on workflow_execution_sessions for efficient rate limit counting
-- This query pattern: WHERE workflow_id = X AND started_at > Y
CREATE INDEX IF NOT EXISTS idx_execution_sessions_rate_limit
  ON workflow_execution_sessions (workflow_id, started_at DESC);

-- Add warnings column to execution_steps for tracking unresolved variables
ALTER TABLE execution_steps
  ADD COLUMN IF NOT EXISTS warnings JSONB;

COMMENT ON COLUMN workflows.max_executions_per_hour IS 'Maximum workflow executions allowed per hour. Default: 100.';
COMMENT ON COLUMN workflows.max_executions_per_minute IS 'Maximum workflow executions allowed per minute (burst protection). Default: 10.';
COMMENT ON COLUMN workflows.consecutive_failure_threshold IS 'Number of consecutive failures before circuit breaker trips. Default: 5.';
COMMENT ON COLUMN workflows.circuit_breaker_tripped_at IS 'Timestamp when circuit breaker last tripped. NULL if not tripped.';
COMMENT ON COLUMN execution_steps.warnings IS 'JSON array of warnings (e.g., unresolved variable references) from this step.';
