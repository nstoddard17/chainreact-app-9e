-- Create table to store AI field resolution results
CREATE TABLE IF NOT EXISTS ai_field_resolutions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_label TEXT,
  field_name TEXT NOT NULL,
  field_type TEXT,
  original_value TEXT, -- The AI placeholder or template
  resolved_value TEXT, -- What the AI actually chose
  available_options JSONB, -- For dropdowns, the options that were available
  resolution_context JSONB, -- The context data used for resolution
  resolution_reasoning TEXT, -- AI's reasoning for the choice
  tokens_used INTEGER DEFAULT 0,
  cost NUMERIC(10, 6) DEFAULT 0,
  model TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ai_field_resolutions table
ALTER TABLE ai_field_resolutions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - users can only see their own AI field resolutions
CREATE POLICY "Users can only see their own AI field resolutions" ON ai_field_resolutions
  FOR ALL USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_field_resolutions_execution_id ON ai_field_resolutions(execution_id);
CREATE INDEX IF NOT EXISTS idx_ai_field_resolutions_workflow_id ON ai_field_resolutions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_field_resolutions_user_id ON ai_field_resolutions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_field_resolutions_node_id ON ai_field_resolutions(node_id);
CREATE INDEX IF NOT EXISTS idx_ai_field_resolutions_resolved_at ON ai_field_resolutions(resolved_at);

-- Create a view for easier querying with workflow and execution details
CREATE OR REPLACE VIEW ai_field_resolutions_detailed AS
SELECT 
  afr.*,
  w.name as workflow_name,
  we.status as execution_status,
  we.started_at as execution_started_at,
  we.completed_at as execution_completed_at
FROM ai_field_resolutions afr
LEFT JOIN workflows w ON afr.workflow_id = w.id
LEFT JOIN workflow_executions we ON afr.execution_id = we.id;

-- Grant permissions for the view
GRANT SELECT ON ai_field_resolutions_detailed TO authenticated;