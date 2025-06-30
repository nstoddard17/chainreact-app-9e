-- Create scheduled_workflow_executions table for handling wait operations and scheduled resumptions
CREATE TABLE IF NOT EXISTS scheduled_workflow_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Scheduling information
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  schedule_type VARCHAR(20) DEFAULT 'wait' CHECK (schedule_type IN ('wait', 'cron', 'webhook', 'manual')),
  
  -- Execution state
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  current_node_id VARCHAR(255) NOT NULL,
  next_node_id VARCHAR(255),
  
  -- Execution context and data
  execution_context JSONB DEFAULT '{}',
  input_data JSONB DEFAULT '{}',
  wait_config JSONB DEFAULT '{}', -- Stores wait configuration (duration, unit, etc.)
  
  -- Retry and error handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on scheduled_workflow_executions table
ALTER TABLE scheduled_workflow_executions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - users can only see their own scheduled executions
CREATE POLICY "Users can only see their own scheduled executions" ON scheduled_workflow_executions
  FOR ALL USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_scheduled_for ON scheduled_workflow_executions(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_status ON scheduled_workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_workflow_id ON scheduled_workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_user_id ON scheduled_workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_execution_id ON scheduled_workflow_executions(workflow_execution_id);

-- Composite index for the cron job query (most important)
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_ready_to_process 
ON scheduled_workflow_executions(scheduled_for, status) 
WHERE status = 'scheduled';

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_scheduled_executions_updated_at 
    BEFORE UPDATE ON scheduled_workflow_executions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE scheduled_workflow_executions IS 'Stores scheduled workflow executions for wait operations and timed resumptions';
COMMENT ON COLUMN scheduled_workflow_executions.scheduled_for IS 'When this execution should be processed';
COMMENT ON COLUMN scheduled_workflow_executions.current_node_id IS 'The node that initiated the wait (e.g., wait_for_time node)';
COMMENT ON COLUMN scheduled_workflow_executions.next_node_id IS 'The next node to execute after the wait completes';
COMMENT ON COLUMN scheduled_workflow_executions.execution_context IS 'Full workflow execution context to resume from';
COMMENT ON COLUMN scheduled_workflow_executions.wait_config IS 'Configuration from the wait node (duration, unit, etc.)'; 