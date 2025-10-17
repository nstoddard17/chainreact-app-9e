-- Add AI memory/learning system for HITL conversations
-- This allows the AI to learn from conversations and improve over time

-- Create table for AI memory/learnings
CREATE TABLE IF NOT EXISTS hitl_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id UUID, -- For organization-wide learnings
  scope TEXT NOT NULL CHECK (scope IN ('workflow', 'user', 'organization')),
  category TEXT NOT NULL CHECK (category IN (
    'tone_preferences',
    'formatting_rules',
    'approval_criteria',
    'common_corrections',
    'business_context',
    'user_preferences'
  )),
  learning_summary TEXT NOT NULL, -- Human-readable summary of the learning
  learning_data JSONB NOT NULL, -- Structured data for the learning
  confidence_score DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence_score BETWEEN 0 AND 1),
  usage_count INTEGER DEFAULT 0, -- How many times this learning has been applied
  last_used_at TIMESTAMP WITH TIME ZONE,
  source_conversation_id UUID REFERENCES hitl_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for knowledge base documents
CREATE TABLE IF NOT EXISTS hitl_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'google_docs',
    'notion',
    'onedrive',
    'custom_text'
  )),
  document_id TEXT NOT NULL, -- External document ID
  document_name TEXT NOT NULL,
  document_content TEXT, -- Cached content for fast access
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for memory lookup
CREATE INDEX IF NOT EXISTS idx_hitl_memory_user_id ON hitl_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_hitl_memory_workflow_id ON hitl_memory(workflow_id);
CREATE INDEX IF NOT EXISTS idx_hitl_memory_scope ON hitl_memory(scope);
CREATE INDEX IF NOT EXISTS idx_hitl_memory_category ON hitl_memory(category);
CREATE INDEX IF NOT EXISTS idx_hitl_memory_confidence ON hitl_memory(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_hitl_memory_usage ON hitl_memory(usage_count DESC);

-- Create indexes for knowledge base
CREATE INDEX IF NOT EXISTS idx_hitl_kb_user_id ON hitl_knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_hitl_kb_workflow_id ON hitl_knowledge_base(workflow_id);
CREATE INDEX IF NOT EXISTS idx_hitl_kb_document_type ON hitl_knowledge_base(document_type);

-- Add memory-related fields to hitl_conversations
ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS knowledge_base_used JSONB, -- Track which KB docs were referenced
  ADD COLUMN IF NOT EXISTS learnings_extracted JSONB, -- Learnings extracted from this conversation
  ADD COLUMN IF NOT EXISTS memory_context_provided TEXT; -- Summary of memory that was used

-- Enable RLS on new tables
ALTER TABLE hitl_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS policies for hitl_memory
CREATE POLICY "Users can view their own memory"
  ON hitl_memory FOR SELECT
  USING (
    auth.uid()::text = user_id
    OR scope = 'organization'
  );

CREATE POLICY "Users can insert their own memory"
  ON hitl_memory FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own memory"
  ON hitl_memory FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own memory"
  ON hitl_memory FOR DELETE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can manage all memory"
  ON hitl_memory FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS policies for hitl_knowledge_base
CREATE POLICY "Users can view their own knowledge base"
  ON hitl_knowledge_base FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can manage their own knowledge base"
  ON hitl_knowledge_base FOR ALL
  USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can manage all knowledge base"
  ON hitl_knowledge_base FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp for memory
CREATE OR REPLACE FUNCTION update_hitl_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for hitl_memory updated_at
CREATE TRIGGER update_hitl_memory_updated_at
  BEFORE UPDATE ON hitl_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_hitl_memory_updated_at();

-- Trigger for hitl_knowledge_base updated_at
CREATE TRIGGER update_hitl_knowledge_base_updated_at
  BEFORE UPDATE ON hitl_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_hitl_memory_updated_at();

-- Function to increment usage count and update last_used_at
CREATE OR REPLACE FUNCTION increment_memory_usage(memory_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE hitl_memory
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments on tables and columns
COMMENT ON TABLE hitl_memory IS 'Stores AI learnings from HITL conversations for continuous improvement';
COMMENT ON TABLE hitl_knowledge_base IS 'References to external documents (Google Docs, Notion, etc.) for AI context';
COMMENT ON COLUMN hitl_memory.learning_summary IS 'Human-readable summary of what was learned';
COMMENT ON COLUMN hitl_memory.learning_data IS 'Structured JSON data containing the actual learning';
COMMENT ON COLUMN hitl_memory.confidence_score IS 'Confidence in this learning (0-1), decreases if contradicted';
COMMENT ON COLUMN hitl_memory.usage_count IS 'Number of times this learning has been applied';
COMMENT ON COLUMN hitl_knowledge_base.document_content IS 'Cached content for fast access without API calls';
