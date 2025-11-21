-- Fix agent_chat_messages table to work with flow_v2_definitions
-- Drop old table if it exists and recreate with correct schema

DROP TABLE IF EXISTS agent_chat_messages CASCADE;

-- Create agent_chat_messages table for per-flow chat persistence
CREATE TABLE agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_v2_definitions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'status')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX idx_agent_chat_messages_flow_id_created
  ON agent_chat_messages(flow_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see messages for flows they can access
-- Note: Since flow_v2_definitions doesn't have owner_id column yet,
-- we'll allow authenticated users to access all messages for now
-- TODO: Update this policy once owner_id is properly set on flow_v2_definitions
CREATE POLICY "Authenticated users can view chat messages"
  ON agent_chat_messages
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policy: Authenticated users can insert messages
CREATE POLICY "Authenticated users can insert chat messages"
  ON agent_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policy: Authenticated users can update messages
CREATE POLICY "Authenticated users can update chat messages"
  ON agent_chat_messages
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- RLS Policy: Authenticated users can delete messages
CREATE POLICY "Authenticated users can delete chat messages"
  ON agent_chat_messages
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Helper function to get chat history with pagination
CREATE OR REPLACE FUNCTION get_agent_chat_history(
  p_flow_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  flow_id UUID,
  role TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For now, allow any authenticated user to read chat history
  -- TODO: Add ownership check once owner_id is properly set on flow_v2_definitions
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.flow_id,
    m.role,
    m.content,
    m.metadata,
    m.created_at
  FROM agent_chat_messages m
  WHERE m.flow_id = p_flow_id
  ORDER BY m.created_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE agent_chat_messages IS 'Stores chat history for AI Agent flows, enabling conversation persistence across sessions';
