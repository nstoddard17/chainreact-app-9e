-- ================================================================
-- ALLOW MULTIPLE ACCOUNTS PER PROVIDER
-- Created: 2025-11-10
-- Purpose: Change unique constraint to allow multiple accounts
--          per provider with different emails
-- ================================================================

-- Drop the old unique constraint that only allows one integration per provider
ALTER TABLE integrations
DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;

-- Add provider_user_id as a top-level column for easier querying and indexing
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

-- Create index on provider_user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_provider_user_id
  ON integrations(provider_user_id)
  WHERE provider_user_id IS NOT NULL;

-- Backfill provider_user_id from metadata JSONB column
UPDATE integrations
SET provider_user_id = metadata->>'provider_user_id'
WHERE provider_user_id IS NULL
  AND metadata->>'provider_user_id' IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN integrations.provider_user_id IS 'Unique user identifier from the OAuth provider (e.g., Google ID, GitHub ID, Discord ID)';

-- Add a new unique constraint that allows multiple accounts per provider
-- but prevents duplicate connections of the same email
-- This constraint only applies when email is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_email_workspace_key
  ON integrations(user_id, provider, email, workspace_type)
  WHERE email IS NOT NULL AND workspace_type = 'personal';

-- For integrations without email (Notion, Instagram), prevent duplicates by provider_user_id
-- This ensures we don't connect the same Notion workspace or Instagram account twice
CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_userid_workspace_key
  ON integrations(user_id, provider, provider_user_id, workspace_type)
  WHERE email IS NULL
    AND provider_user_id IS NOT NULL
    AND workspace_type = 'personal';

-- For team/org workspaces, ensure one integration per provider per workspace
CREATE UNIQUE INDEX IF NOT EXISTS integrations_workspace_provider_email_key
  ON integrations(provider, email, workspace_type, workspace_id)
  WHERE email IS NOT NULL
    AND workspace_type IN ('team', 'organization')
    AND workspace_id IS NOT NULL;

-- Add comments explaining the constraints
COMMENT ON INDEX integrations_user_provider_email_workspace_key IS
  'Allows multiple accounts per provider with different emails for personal workspaces';

COMMENT ON INDEX integrations_user_provider_userid_workspace_key IS
  'Prevents duplicate connections for providers without email (uses provider_user_id)';

COMMENT ON INDEX integrations_workspace_provider_email_key IS
  'One integration per provider per team/organization workspace';
