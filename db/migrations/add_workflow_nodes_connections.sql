-- Add nodes and connections columns to workflows table
-- These columns will store the workflow structure as JSON

-- Add nodes column (JSONB for better performance and querying)
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb;

-- Add connections column (JSONB for better performance and querying)
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS connections JSONB DEFAULT '[]'::jsonb;

-- Add status column for workflow state
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived'));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_nodes_gin ON workflows USING GIN (nodes);
CREATE INDEX IF NOT EXISTS idx_workflows_connections_gin ON workflows USING GIN (connections);

-- Add comments for documentation
COMMENT ON COLUMN workflows.nodes IS 'JSON array of workflow nodes with their positions and configurations';
COMMENT ON COLUMN workflows.connections IS 'JSON array of connections between workflow nodes';
COMMENT ON COLUMN workflows.status IS 'Workflow status: draft, active, or archived'; 