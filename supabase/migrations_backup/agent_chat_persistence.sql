-- Create agent_chat_messages table for per-flow chat persistence
CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows_v2(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'status')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_flow_id_created
  ON agent_chat_messages(flow_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see messages for flows they own
CREATE POLICY "Users can view their own flow chat messages"
  ON agent_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flows_v2
      WHERE flows_v2.id = agent_chat_messages.flow_id
      AND flows_v2.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert messages for flows they own
CREATE POLICY "Users can insert chat messages for their flows"
  ON agent_chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flows_v2
      WHERE flows_v2.id = agent_chat_messages.flow_id
      AND flows_v2.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update their own flow chat messages
CREATE POLICY "Users can update their own flow chat messages"
  ON agent_chat_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flows_v2
      WHERE flows_v2.id = agent_chat_messages.flow_id
      AND flows_v2.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete their own flow chat messages
CREATE POLICY "Users can delete their own flow chat messages"
  ON agent_chat_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flows_v2
      WHERE flows_v2.id = agent_chat_messages.flow_id
      AND flows_v2.user_id = auth.uid()
    )
  );

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
  -- Verify user owns the flow
  IF NOT EXISTS (
    SELECT 1 FROM flows_v2
    WHERE flows_v2.id = p_flow_id
    AND flows_v2.user_id = auth.uid()
  ) THEN
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
