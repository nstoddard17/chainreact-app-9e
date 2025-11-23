-- Migration: Add missing columns to HITL tables
-- This fixes the incomplete hitl_conversations table

-- ============================================
-- Add missing columns to hitl_conversations
-- ============================================
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS node_id TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS channel_type TEXT DEFAULT 'discord';
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS extracted_variables JSONB DEFAULT '{}'::jsonb;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS learnings_extracted JSONB;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS initial_message TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS context_data TEXT;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS extract_variables JSONB DEFAULT '{}'::jsonb;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS continuation_signals JSONB DEFAULT '["continue", "proceed", "go ahead", "send it", "looks good", "approve"]'::jsonb;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER DEFAULT 60;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS timeout_action TEXT DEFAULT 'cancel';
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS knowledge_base_used JSONB DEFAULT '[]'::jsonb;
ALTER TABLE hitl_conversations ADD COLUMN IF NOT EXISTS memory_context_provided TEXT;

-- ============================================
-- Add missing columns to executions table
-- ============================================
ALTER TABLE executions ADD COLUMN IF NOT EXISTS paused_node_id TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS resume_data JSONB;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT FALSE;

-- ============================================
-- Create workflow_executions view
-- ============================================
CREATE OR REPLACE VIEW workflow_executions AS SELECT * FROM executions;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_executions TO service_role;

-- ============================================
-- Create indexes (only if columns exist)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_channel_id ON hitl_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_status ON hitl_conversations(status);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_timeout_at ON hitl_conversations(timeout_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_executions_paused_node_id ON executions(paused_node_id) WHERE paused_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_executions_status_paused ON executions(status) WHERE status = 'paused';
