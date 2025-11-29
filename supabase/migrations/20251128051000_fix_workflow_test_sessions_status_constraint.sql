-- Fix workflow_test_sessions status check constraint to allow 'listening' status
-- The test trigger uses status='listening' but the constraint may not include it

-- Drop the existing check constraint if it exists
ALTER TABLE public.workflow_test_sessions DROP CONSTRAINT IF EXISTS workflow_test_sessions_status_check;

-- Add a new constraint that includes all needed statuses
ALTER TABLE public.workflow_test_sessions
  ADD CONSTRAINT workflow_test_sessions_status_check
  CHECK (status IN ('listening', 'executing', 'completed', 'expired', 'failed', 'pending', 'running', 'success', 'error'));
