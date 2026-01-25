-- Fix agent_chat_messages to prevent blank content rows
-- These are UI-only state containers (provider dropdowns) that should not be persisted

-- First, delete any existing blank content rows
DELETE FROM agent_chat_messages WHERE content = '' OR content IS NULL;

-- Add constraint to prevent future blank rows
-- Using DO block to handle case where constraint might already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_not_blank'
    AND conrelid = 'agent_chat_messages'::regclass
  ) THEN
    ALTER TABLE agent_chat_messages
    ADD CONSTRAINT content_not_blank CHECK (content <> '');
  END IF;
END $$;

-- Create index on (flow_id, created_at DESC) if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_agent_chat_flow_created
ON agent_chat_messages(flow_id, created_at DESC);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT content_not_blank ON agent_chat_messages IS
'Prevents saving empty chat messages - UI state containers (like provider dropdowns) should be ephemeral and not persisted';
