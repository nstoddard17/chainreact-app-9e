-- Add missing columns to workflow_execution_sessions that the execution engine
-- already writes (advancedExecutionEngine.ts:updateSessionStatus) and the
-- analytics dashboard reads (api/analytics/dashboard/route.ts).
-- Without these columns, duration calculations and error tracking return NULL.

ALTER TABLE public.workflow_execution_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Index for analytics queries that filter by date range
CREATE INDEX IF NOT EXISTS idx_execution_sessions_started_at
  ON public.workflow_execution_sessions (user_id, started_at DESC);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
