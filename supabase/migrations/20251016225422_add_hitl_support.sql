-- Add human-in-the-loop support to workflow executions
-- This enables workflows to pause for conversational interaction

-- Add status and pause fields to workflow_executions
ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS paused_node_id TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resume_data JSONB;

-- Create index on status for filtering paused workflows
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_paused_at ON workflow_executions(paused_at) WHERE status = 'paused';

-- Create table for conversation history
CREATE TABLE IF NOT EXISTS hitl_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('discord', 'slack', 'sms')),
  channel_id TEXT NOT NULL, -- Discord channel/thread ID, Slack channel, phone number
  user_id TEXT NOT NULL, -- ChainReact user ID
  external_user_id TEXT, -- Discord/Slack user ID for verification
  conversation_history JSONB NOT NULL DEFAULT '[]',
  extracted_variables JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'timeout', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  timeout_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for conversation lookup
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_execution_id ON hitl_conversations(execution_id);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_channel ON hitl_conversations(channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_status ON hitl_conversations(status);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_timeout ON hitl_conversations(timeout_at) WHERE status = 'active';

-- Enable RLS on hitl_conversations
ALTER TABLE hitl_conversations ENABLE ROW LEVEL SECURITY;

-- RLS policies for hitl_conversations
CREATE POLICY "Users can view their own HITL conversations"
  ON hitl_conversations FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own HITL conversations"
  ON hitl_conversations FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can manage all HITL conversations"
  ON hitl_conversations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hitl_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_hitl_conversations_updated_at
  BEFORE UPDATE ON hitl_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_hitl_conversations_updated_at();

-- Comment on tables and columns
COMMENT ON TABLE hitl_conversations IS 'Stores conversation state for human-in-the-loop workflow nodes';
COMMENT ON COLUMN hitl_conversations.conversation_history IS 'Array of message objects with role and content';
COMMENT ON COLUMN hitl_conversations.extracted_variables IS 'Variables extracted from conversation to pass to workflow';
COMMENT ON COLUMN workflow_executions.status IS 'Execution status including paused state for HITL';
COMMENT ON COLUMN workflow_executions.paused_node_id IS 'Node ID where execution is paused';
COMMENT ON COLUMN workflow_executions.resume_data IS 'Data needed to resume execution from paused state';
