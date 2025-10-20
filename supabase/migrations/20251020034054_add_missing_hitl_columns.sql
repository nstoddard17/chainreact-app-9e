-- Add missing columns to hitl_conversations table
-- These columns are needed for HITL workflow execution

ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS guild_id TEXT, -- Discord guild ID
  ADD COLUMN IF NOT EXISTS system_prompt TEXT, -- AI system prompt
  ADD COLUMN IF NOT EXISTS initial_message TEXT, -- Initial message sent to user
  ADD COLUMN IF NOT EXISTS context_data TEXT, -- Context from previous workflow step
  ADD COLUMN IF NOT EXISTS extract_variables JSONB DEFAULT '{}', -- Variables to extract from conversation
  ADD COLUMN IF NOT EXISTS continuation_signals JSONB DEFAULT '[]', -- Phrases that signal workflow should continue
  ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER DEFAULT 60, -- Timeout in minutes
  ADD COLUMN IF NOT EXISTS timeout_action TEXT DEFAULT 'cancel' CHECK (timeout_action IN ('cancel', 'continue', 'fallback'));

-- Create index on workflow_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_workflow_id ON hitl_conversations(workflow_id);

-- Comments on new columns
COMMENT ON COLUMN hitl_conversations.workflow_id IS 'Workflow this conversation belongs to';
COMMENT ON COLUMN hitl_conversations.guild_id IS 'Discord guild/server ID for Discord channels';
COMMENT ON COLUMN hitl_conversations.system_prompt IS 'System prompt with instructions for AI assistant';
COMMENT ON COLUMN hitl_conversations.initial_message IS 'First message sent to user to start conversation';
COMMENT ON COLUMN hitl_conversations.context_data IS 'Formatted data from previous workflow step shown to user';
COMMENT ON COLUMN hitl_conversations.extract_variables IS 'JSON object defining what variables to extract from conversation';
COMMENT ON COLUMN hitl_conversations.continuation_signals IS 'Array of phrases that indicate user wants to continue workflow';
COMMENT ON COLUMN hitl_conversations.timeout_minutes IS 'How long to wait for user response before timeout';
COMMENT ON COLUMN hitl_conversations.timeout_action IS 'What to do when conversation times out';
