-- Add trigger_data column to workflow_test_sessions
-- This stores the trigger event data so the frontend can fetch it and execute via SSE
-- for real-time visual feedback during workflow testing

-- Add trigger_data column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_test_sessions' AND column_name = 'trigger_data'
  ) THEN
    ALTER TABLE workflow_test_sessions ADD COLUMN trigger_data JSONB;
  END IF;
END $$;

-- Update status constraint to include 'trigger_received' status
-- The webhook processor sets this status when trigger data is stored
-- (waiting for frontend to execute via SSE)
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  ALTER TABLE workflow_test_sessions DROP CONSTRAINT IF EXISTS workflow_test_sessions_status_check;

  -- Add the updated constraint with 'trigger_received' status
  ALTER TABLE workflow_test_sessions
    ADD CONSTRAINT workflow_test_sessions_status_check
    CHECK (status IN ('listening', 'trigger_received', 'executing', 'completed', 'expired', 'failed'));
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- Table doesn't exist, skip
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN workflow_test_sessions.trigger_data IS
  'Stores the trigger event data from webhook. Frontend fetches this and executes via SSE for real-time updates.';
