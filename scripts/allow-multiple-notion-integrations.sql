-- Allow multiple Notion integrations per user
-- This removes the unique constraint for Notion provider specifically

-- First, let's check the current constraint
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'integrations'::regclass 
AND conname = 'integrations_user_id_provider_key';

-- Drop the unique constraint
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;

-- Create a new unique constraint that excludes Notion
-- This allows multiple Notion integrations but maintains uniqueness for other providers
ALTER TABLE integrations 
ADD CONSTRAINT integrations_user_id_provider_key 
UNIQUE (user_id, provider) 
WHERE provider != 'notion';

-- Create a separate unique constraint for Notion that includes workspace_id
-- This ensures each workspace can only be connected once per user
ALTER TABLE integrations 
ADD CONSTRAINT integrations_notion_workspace_unique 
UNIQUE (user_id, provider, (metadata->>'workspace_id')) 
WHERE provider = 'notion';

-- Add an index for better performance when querying Notion integrations
CREATE INDEX IF NOT EXISTS idx_integrations_notion_workspace 
ON integrations(user_id, provider, (metadata->>'workspace_id')) 
WHERE provider = 'notion';

-- Verify the changes
SELECT 
    conname, 
    contype, 
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'integrations'::regclass 
AND conname IN ('integrations_user_id_provider_key', 'integrations_notion_workspace_unique'); 