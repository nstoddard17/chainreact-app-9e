-- Create comprehensive workflow execution history tables

-- Create execution history table to store all workflow runs
CREATE TABLE IF NOT EXISTS workflow_execution_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  test_mode BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  trigger_data JSONB,
  final_output JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_execution_id UNIQUE (execution_id)
);

-- Create execution steps table to store individual node executions
CREATE TABLE IF NOT EXISTS workflow_execution_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_history_id UUID NOT NULL REFERENCES workflow_execution_history(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(255) NOT NULL,
  node_name VARCHAR(255),
  step_number INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  error_details JSONB,
  test_mode_preview JSONB, -- Store what would have been sent in test mode
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_execution_step UNIQUE (execution_history_id, node_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_execution_history_workflow_id ON workflow_execution_history(workflow_id);
CREATE INDEX idx_execution_history_user_id ON workflow_execution_history(user_id);
CREATE INDEX idx_execution_history_execution_id ON workflow_execution_history(execution_id);
CREATE INDEX idx_execution_history_status ON workflow_execution_history(status);
CREATE INDEX idx_execution_history_started_at ON workflow_execution_history(started_at DESC);

CREATE INDEX idx_execution_steps_history_id ON workflow_execution_steps(execution_history_id);
CREATE INDEX idx_execution_steps_node_id ON workflow_execution_steps(node_id);
CREATE INDEX idx_execution_steps_status ON workflow_execution_steps(status);
CREATE INDEX idx_execution_steps_started_at ON workflow_execution_steps(started_at DESC);

-- Add RLS policies
ALTER TABLE workflow_execution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution_steps ENABLE ROW LEVEL SECURITY;

-- Users can view their own execution history
CREATE POLICY "Users can view own execution history"
  ON workflow_execution_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own execution history
CREATE POLICY "Users can insert own execution history"
  ON workflow_execution_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own execution history
CREATE POLICY "Users can update own execution history"
  ON workflow_execution_history
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own execution history
CREATE POLICY "Users can delete own execution history"
  ON workflow_execution_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can view execution steps for their workflows
CREATE POLICY "Users can view own execution steps"
  ON workflow_execution_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflow_execution_history
      WHERE workflow_execution_history.id = workflow_execution_steps.execution_history_id
      AND workflow_execution_history.user_id = auth.uid()
    )
  );

-- Users can insert execution steps for their workflows
CREATE POLICY "Users can insert own execution steps"
  ON workflow_execution_steps
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflow_execution_history
      WHERE workflow_execution_history.id = workflow_execution_steps.execution_history_id
      AND workflow_execution_history.user_id = auth.uid()
    )
  );

-- Users can update execution steps for their workflows
CREATE POLICY "Users can update own execution steps"
  ON workflow_execution_steps
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workflow_execution_history
      WHERE workflow_execution_history.id = workflow_execution_steps.execution_history_id
      AND workflow_execution_history.user_id = auth.uid()
    )
  );

-- Function to clean up old execution history (keep last 100 per workflow)
CREATE OR REPLACE FUNCTION cleanup_old_execution_history()
RETURNS void AS $$
BEGIN
  DELETE FROM workflow_execution_history
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY started_at DESC) as rn
      FROM workflow_execution_history
    ) ranked
    WHERE rn > 100
  );
END;
$$ LANGUAGE plpgsql;

-- Create a function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_workflow_execution_history_updated_at
  BEFORE UPDATE ON workflow_execution_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();