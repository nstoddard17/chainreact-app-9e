-- MANUAL FIX for agent_chat_messages function signature conflict
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/xzwsdwllmrnrgbltibxt/sql

-- Step 1: Drop ALL possible versions of the function (including variations)
DROP FUNCTION IF EXISTS get_agent_chat_history(UUID, UUID, INTEGER, INTEGER) CASCADE;  -- Old 4-param version
DROP FUNCTION IF EXISTS get_agent_chat_history(UUID, INTEGER, INTEGER, UUID) CASCADE;  -- Variation
DROP FUNCTION IF EXISTS get_agent_chat_history(UUID, INTEGER, INTEGER) CASCADE;        -- New 3-param version
DROP FUNCTION IF EXISTS public.get_agent_chat_history(UUID, UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.get_agent_chat_history(UUID, INTEGER, INTEGER, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_agent_chat_history(UUID, INTEGER, INTEGER) CASCADE;

-- Force drop by name pattern (catches any remaining signatures)
DO $$
DECLARE
  func_signature TEXT;
BEGIN
  FOR func_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'get_agent_chat_history'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_signature || ' CASCADE';
    RAISE NOTICE 'Dropped function: %', func_signature;
  END LOOP;
END $$;

-- Step 2: Drop and recreate table to ensure clean state
DROP TABLE IF EXISTS agent_chat_messages CASCADE;

-- Step 3: Create agent_chat_messages table
CREATE TABLE agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flow_v2_definitions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'status')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Create index
CREATE INDEX idx_agent_chat_messages_flow_id_created
  ON agent_chat_messages(flow_id, created_at DESC);

-- Step 5: Enable RLS
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies
CREATE POLICY "Authenticated users can view chat messages"
  ON agent_chat_messages
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert chat messages"
  ON agent_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update chat messages"
  ON agent_chat_messages
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete chat messages"
  ON agent_chat_messages
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Step 7: Create the 3-parameter function (matching our API calls)
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

-- Step 8: Add documentation
COMMENT ON FUNCTION get_agent_chat_history(UUID, INTEGER, INTEGER) IS 'Gets chat history for a flow. Parameters: p_flow_id, p_limit, p_offset';
COMMENT ON TABLE agent_chat_messages IS 'Stores chat history for AI Agent flows, enabling conversation persistence across sessions';

-- Step 9: Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Step 10: Verification - Check that only the 3-param version exists
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'get_agent_chat_history';

-- Should return exactly 1 row with: get_agent_chat_history(p_flow_id uuid, p_limit integer, p_offset integer)
