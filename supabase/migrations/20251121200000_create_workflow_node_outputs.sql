-- Create workflow_node_outputs table to persist node execution outputs
-- This allows running individual nodes using cached data from previous executions

CREATE TABLE IF NOT EXISTS workflow_node_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  output_data JSONB NOT NULL DEFAULT '{}',
  input_data JSONB DEFAULT '{}',
  execution_id UUID, -- Optional reference to the execution that produced this output
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each workflow can only have one cached output per node
  UNIQUE(workflow_id, node_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_workflow_node_outputs_workflow_id ON workflow_node_outputs(workflow_id);
CREATE INDEX idx_workflow_node_outputs_user_id ON workflow_node_outputs(user_id);
CREATE INDEX idx_workflow_node_outputs_node_id ON workflow_node_outputs(node_id);
CREATE INDEX idx_workflow_node_outputs_executed_at ON workflow_node_outputs(executed_at DESC);

-- Enable RLS
ALTER TABLE workflow_node_outputs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own node outputs
CREATE POLICY "Users can view own workflow node outputs"
  ON workflow_node_outputs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own node outputs
CREATE POLICY "Users can insert own workflow node outputs"
  ON workflow_node_outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own node outputs
CREATE POLICY "Users can update own workflow node outputs"
  ON workflow_node_outputs FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own node outputs
CREATE POLICY "Users can delete own workflow node outputs"
  ON workflow_node_outputs FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all records (for backend operations)
CREATE POLICY "Service role can access all workflow node outputs"
  ON workflow_node_outputs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_node_outputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER trigger_update_workflow_node_outputs_updated_at
  BEFORE UPDATE ON workflow_node_outputs
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_node_outputs_updated_at();

-- Add comment to table
COMMENT ON TABLE workflow_node_outputs IS 'Stores the most recent output from each workflow node to enable running individual nodes with cached input data';
