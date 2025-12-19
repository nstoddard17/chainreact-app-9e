-- Create or update user_memory_documents table for HITL AI Memory and Knowledge Base
-- This table stores user-controlled documents for AI memory storage

CREATE TABLE IF NOT EXISTS user_memory_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL DEFAULT 'memory',
  title TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  content TEXT DEFAULT '',
  structured_data JSONB DEFAULT '{}',
  scope TEXT DEFAULT 'user',
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if table already exists
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'memory';
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Untitled';
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '{}';
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'user';
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE user_memory_documents ADD COLUMN IF NOT EXISTS workflow_id UUID;

-- Create indexes for common queries (use IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_memory_documents_user_id') THEN
    CREATE INDEX idx_user_memory_documents_user_id ON user_memory_documents(user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_memory_documents_doc_type') THEN
    CREATE INDEX idx_user_memory_documents_doc_type ON user_memory_documents(doc_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_memory_documents_workflow_id') THEN
    CREATE INDEX idx_user_memory_documents_workflow_id ON user_memory_documents(workflow_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_memory_documents_user_type') THEN
    CREATE INDEX idx_user_memory_documents_user_type ON user_memory_documents(user_id, doc_type);
  END IF;
END$$;

-- Enable RLS
ALTER TABLE user_memory_documents ENABLE ROW LEVEL SECURITY;

-- Users can only access their own documents
CREATE POLICY "Users can view their own memory documents"
  ON user_memory_documents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own memory documents"
  ON user_memory_documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memory documents"
  ON user_memory_documents
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memory documents"
  ON user_memory_documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_memory_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_memory_documents_updated_at ON user_memory_documents;
CREATE TRIGGER trigger_update_user_memory_documents_updated_at
  BEFORE UPDATE ON user_memory_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_user_memory_documents_updated_at();

-- Also create hitl_conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS hitl_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  workflow_id UUID NOT NULL,
  channel_type TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_history JSONB DEFAULT '[]',
  extracted_variables JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'timeout', 'cancelled')),
  timeout_at TIMESTAMP WITH TIME ZONE,
  timeout_minutes INTEGER DEFAULT 60,
  timeout_action TEXT DEFAULT 'cancel' CHECK (timeout_action IN ('cancel', 'proceed')),
  system_prompt TEXT,
  initial_message TEXT,
  context_data TEXT,
  extract_variables JSONB DEFAULT '{}',
  continuation_signals JSONB DEFAULT '["continue", "proceed", "go ahead", "send it", "looks good", "approve"]',
  knowledge_base_used JSONB DEFAULT '[]',
  memory_context_provided TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for hitl_conversations
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_execution_id ON hitl_conversations(execution_id);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_channel_id ON hitl_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_status ON hitl_conversations(status);
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_user_id ON hitl_conversations(user_id);

-- Enable RLS for hitl_conversations
ALTER TABLE hitl_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own HITL conversations
CREATE POLICY "Users can view their own HITL conversations"
  ON hitl_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for system operations)
CREATE POLICY "Service role has full access to HITL conversations"
  ON hitl_conversations
  FOR ALL
  USING (true)
  WITH CHECK (true);
