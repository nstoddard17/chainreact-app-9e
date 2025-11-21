-- Create trigger_poll_state table for tracking polling trigger state
-- This table stores the last poll time for each polling trigger to prevent duplicate executions

CREATE TABLE IF NOT EXISTS trigger_poll_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  last_poll_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Ensure one record per workflow-node combination
  CONSTRAINT unique_workflow_node UNIQUE (workflow_id, node_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trigger_poll_state_workflow_id ON trigger_poll_state(workflow_id);
CREATE INDEX IF NOT EXISTS idx_trigger_poll_state_last_poll_time ON trigger_poll_state(last_poll_time);

-- Enable Row Level Security
ALTER TABLE trigger_poll_state ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access poll state for their own workflows
CREATE POLICY trigger_poll_state_user_access ON trigger_poll_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workflows
      WHERE workflows.id = trigger_poll_state.workflow_id
      AND workflows.user_id = auth.uid()
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trigger_poll_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update function
CREATE TRIGGER trigger_poll_state_updated_at
  BEFORE UPDATE ON trigger_poll_state
  FOR EACH ROW
  EXECUTE FUNCTION update_trigger_poll_state_updated_at();

-- Add comment for documentation
COMMENT ON TABLE trigger_poll_state IS 'Tracks the last poll time for polling-based triggers to prevent duplicate executions';
COMMENT ON COLUMN trigger_poll_state.workflow_id IS 'Reference to the workflow containing the polling trigger';
COMMENT ON COLUMN trigger_poll_state.node_id IS 'The node ID of the polling trigger within the workflow';
COMMENT ON COLUMN trigger_poll_state.last_poll_time IS 'The timestamp of the last successful poll';
