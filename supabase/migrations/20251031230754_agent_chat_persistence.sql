-- Agent Chat Persistence
-- Stores chat history per flow for AI agent interactions

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'status')),
  text TEXT NOT NULL,
  subtext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb,

  -- For ordering within same timestamp
  sequence INTEGER NOT NULL DEFAULT 0
);

-- Index for fast flow lookups
CREATE INDEX idx_agent_chat_flow_user ON agent_chat_messages(flow_id, user_id, created_at DESC);

-- Index for pagination
CREATE INDEX idx_agent_chat_created_at ON agent_chat_messages(created_at DESC);

-- RLS Policies
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own chat messages
CREATE POLICY "Users can view own chat messages"
  ON agent_chat_messages
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own chat messages
CREATE POLICY "Users can insert own chat messages"
  ON agent_chat_messages
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own chat messages (for status updates)
CREATE POLICY "Users can update own chat messages"
  ON agent_chat_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own chat messages
CREATE POLICY "Users can delete own chat messages"
  ON agent_chat_messages
  FOR DELETE
  USING (user_id = auth.uid());

-- Function to get chat history for a flow
CREATE OR REPLACE FUNCTION get_agent_chat_history(
  p_flow_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  text TEXT,
  subtext TEXT,
  created_at TIMESTAMPTZ,
  meta JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.text,
    m.subtext,
    m.created_at,
    m.meta
  FROM agent_chat_messages m
  WHERE m.flow_id = p_flow_id
    AND m.user_id = p_user_id
  ORDER BY m.created_at DESC, m.sequence DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_agent_chat_history TO authenticated;

COMMENT ON TABLE agent_chat_messages IS 'Persistent chat history for AI agent flow builder interactions';
COMMENT ON COLUMN agent_chat_messages.role IS 'Message role: user (human input), assistant (AI response), status (system updates)';
COMMENT ON COLUMN agent_chat_messages.meta IS 'Additional metadata (plan data, node IDs, cost estimates, etc.)';
COMMENT ON COLUMN agent_chat_messages.sequence IS 'Tiebreaker for messages with same timestamp';
