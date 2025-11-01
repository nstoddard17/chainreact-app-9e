-- FIX: Remove auth check from get_agent_chat_history function
-- Since we're using service role client in the API, auth.uid() is NULL
-- The API layer handles auth, so the function just needs to filter by flow_id

-- Drop and recreate the function without auth check
DROP FUNCTION IF EXISTS get_agent_chat_history(UUID, INTEGER, INTEGER) CASCADE;

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
  -- No auth check needed - API layer (service role) handles auth
  -- Just filter by flow_id
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

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT 'Function updated successfully' as status;
