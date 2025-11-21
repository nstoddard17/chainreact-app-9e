-- Create waiting_executions table for Wait for Event node
-- This table stores workflow executions that are paused waiting for specific events

CREATE TABLE IF NOT EXISTS waiting_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,

  -- Event configuration
  event_type TEXT NOT NULL, -- 'webhook', 'custom_event', 'integration_event'
  event_config JSONB NOT NULL, -- Full event configuration from the node
  match_condition JSONB, -- Optional JSON condition to match incoming events

  -- Timing
  paused_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMP WITH TIME ZONE,
  timeout_at TIMESTAMP WITH TIME ZONE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'resumed', 'timed_out', 'cancelled'

  -- Execution data to resume with
  execution_data JSONB NOT NULL, -- Contains input, resumeFrom, allPreviousData

  -- Event data that triggered resumption (populated when resumed)
  resume_event_data JSONB,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_waiting_executions_status ON waiting_executions(status);
CREATE INDEX idx_waiting_executions_user_id ON waiting_executions(user_id);
CREATE INDEX idx_waiting_executions_workflow_id ON waiting_executions(workflow_id);
CREATE INDEX idx_waiting_executions_execution_id ON waiting_executions(execution_id);
CREATE INDEX idx_waiting_executions_event_type ON waiting_executions(event_type);
CREATE INDEX idx_waiting_executions_timeout_at ON waiting_executions(timeout_at) WHERE timeout_at IS NOT NULL;

-- Create a compound index for finding waiting executions by event type and status
CREATE INDEX idx_waiting_executions_event_status ON waiting_executions(event_type, status) WHERE status = 'waiting';

-- Add RLS policies
ALTER TABLE waiting_executions ENABLE ROW LEVEL SECURITY;

-- Users can view their own waiting executions
CREATE POLICY "Users can view own waiting executions"
  ON waiting_executions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own waiting executions
CREATE POLICY "Users can create own waiting executions"
  ON waiting_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own waiting executions
CREATE POLICY "Users can update own waiting executions"
  ON waiting_executions FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_waiting_executions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_waiting_executions_updated_at
  BEFORE UPDATE ON waiting_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_waiting_executions_updated_at();

-- Comment on table
COMMENT ON TABLE waiting_executions IS 'Stores workflow executions that are paused waiting for events (Wait for Event node)';
