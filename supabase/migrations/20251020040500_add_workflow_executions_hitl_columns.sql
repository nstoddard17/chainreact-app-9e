-- Add missing HITL columns to workflow_executions table
-- These columns enable workflows to pause for human-in-the-loop interactions

ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS paused_node_id TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resume_data JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update status column to have proper check constraint if not already set
-- (status column already exists but may not have the constraint)
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE workflow_executions DROP CONSTRAINT IF EXISTS workflow_executions_status_check;

  -- Add new constraint with all valid status values
  ALTER TABLE workflow_executions
    ADD CONSTRAINT workflow_executions_status_check
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled'));
EXCEPTION
  WHEN others THEN
    -- If constraint already exists with correct values, ignore error
    NULL;
END $$;

-- Create indexes for HITL queries
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_paused_at ON workflow_executions(paused_at) WHERE status = 'paused';
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_workflow ON workflow_executions(user_id, workflow_id);

-- Add comments
COMMENT ON COLUMN workflow_executions.paused_node_id IS 'Node ID where execution is paused (for HITL)';
COMMENT ON COLUMN workflow_executions.paused_at IS 'Timestamp when execution was paused';
COMMENT ON COLUMN workflow_executions.resume_data IS 'Data needed to resume execution from paused state';
COMMENT ON COLUMN workflow_executions.updated_at IS 'Last update timestamp';
