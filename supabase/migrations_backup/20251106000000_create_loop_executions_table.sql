-- Create loop_executions table for tracking loop progress
CREATE TABLE IF NOT EXISTS loop_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES workflow_execution_sessions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  max_iterations INT NOT NULL DEFAULT 100,
  iteration_count INT NOT NULL DEFAULT 0,
  current_item_index INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  loop_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_loop_executions_session_id ON loop_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_loop_executions_node_id ON loop_executions(node_id);
CREATE INDEX IF NOT EXISTS idx_loop_executions_status ON loop_executions(status);

-- Add RLS policies
ALTER TABLE loop_executions ENABLE ROW LEVEL SECURITY;

-- Users can view their own loop executions
CREATE POLICY "Users can view their own loop executions"
ON loop_executions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workflow_execution_sessions wes
    WHERE wes.id = loop_executions.session_id
    AND wes.user_id = auth.uid()
  )
);

-- Service role can manage all loop executions
CREATE POLICY "Service role can manage all loop executions"
ON loop_executions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_loop_executions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loop_executions_updated_at
BEFORE UPDATE ON loop_executions
FOR EACH ROW
EXECUTE FUNCTION update_loop_executions_updated_at();
