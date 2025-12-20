-- Add 'paused' status to executions table for HITL (Human-in-the-Loop) workflow support
-- The HITL feature needs to pause workflow execution while waiting for user input

-- Drop the existing check constraint if it exists
ALTER TABLE public.executions DROP CONSTRAINT IF EXISTS executions_status_check;

-- Add a new constraint that includes 'paused' status
-- Based on the statuses used in the codebase:
-- - pending: Initial state
-- - running: Currently executing
-- - completed: Finished successfully
-- - failed: Finished with error
-- - paused: Waiting for external input (HITL, wait-for-event, etc.)
ALTER TABLE public.executions
  ADD CONSTRAINT executions_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused'));
