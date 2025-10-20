-- Create user_memory_documents table for ChainReact Memory feature
-- This allows users to store AI memory and knowledge base documents directly in Supabase
-- instead of relying on external providers (Google Docs, Notion, etc.)

CREATE TABLE IF NOT EXISTS user_memory_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,

  -- Type of document
  doc_type TEXT NOT NULL CHECK (doc_type IN ('memory', 'knowledge_base')),

  -- Content (stored as markdown for readability)
  content TEXT,

  -- Structured data (parsed memory categories for faster queries)
  structured_data JSONB DEFAULT '{}',

  -- Metadata
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,

  -- Scope: 'user' = global across all workflows, 'workflow' = specific to one workflow
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'workflow', 'global')),

  -- Ensure one memory doc and one KB doc per user/workflow combination
  UNIQUE(user_id, workflow_id, doc_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_memory_user_id
  ON user_memory_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_user_memory_workflow_id
  ON user_memory_documents(workflow_id);

CREATE INDEX IF NOT EXISTS idx_user_memory_doc_type
  ON user_memory_documents(doc_type);

CREATE INDEX IF NOT EXISTS idx_user_memory_scope
  ON user_memory_documents(scope);

-- RLS Policies
ALTER TABLE user_memory_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own memory documents" ON user_memory_documents;
DROP POLICY IF EXISTS "Users can create their own memory documents" ON user_memory_documents;
DROP POLICY IF EXISTS "Users can update their own memory documents" ON user_memory_documents;
DROP POLICY IF EXISTS "Users can delete their own memory documents" ON user_memory_documents;

-- Users can view their own memory documents
CREATE POLICY "Users can view their own memory documents"
  ON user_memory_documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own memory documents
CREATE POLICY "Users can create their own memory documents"
  ON user_memory_documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own memory documents
CREATE POLICY "Users can update their own memory documents"
  ON user_memory_documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own memory documents
CREATE POLICY "Users can delete their own memory documents"
  ON user_memory_documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_memory_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_user_memory_documents_updated_at ON user_memory_documents;

CREATE TRIGGER update_user_memory_documents_updated_at
  BEFORE UPDATE ON user_memory_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_user_memory_documents_updated_at();

-- Comments for documentation
COMMENT ON TABLE user_memory_documents IS 'Stores AI memory and knowledge base documents for ChainReact Memory feature';
COMMENT ON COLUMN user_memory_documents.doc_type IS 'Type of document: memory (AI learnings) or knowledge_base (reference documents)';
COMMENT ON COLUMN user_memory_documents.scope IS 'Scope: user (global), workflow (specific workflow), or global (system-wide)';
COMMENT ON COLUMN user_memory_documents.structured_data IS 'Parsed memory categories or KB metadata for faster queries';
