-- ================================================================
-- ADD ACCOUNT IDENTITY FIELDS TO INTEGRATIONS
-- Created: 2025-11-10
-- Purpose: Add dedicated columns for email, username, and account_name
--          to make account identification easier and more queryable
-- ================================================================

-- Add dedicated columns for account identification
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS account_name TEXT;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_email
  ON integrations(email)
  WHERE email IS NOT NULL;

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_username
  ON integrations(username)
  WHERE username IS NOT NULL;

-- Backfill existing data from metadata JSONB column
-- Extract email, username, account_name from metadata and populate the new columns
UPDATE integrations
SET
  email = COALESCE(
    metadata->>'email',
    metadata->>'userEmail'
  ),
  username = COALESCE(
    metadata->>'username',
    metadata->>'name',
    metadata->>'user_name'
  ),
  account_name = COALESCE(
    metadata->>'account_name',
    metadata->>'accountName',
    metadata->>'name',
    metadata->>'real_name'
  )
WHERE
  email IS NULL
  AND (
    metadata->>'email' IS NOT NULL
    OR metadata->>'userEmail' IS NOT NULL
    OR metadata->>'username' IS NOT NULL
    OR metadata->>'account_name' IS NOT NULL
  );

-- Add comment explaining the columns
COMMENT ON COLUMN integrations.email IS 'User email address for the connected account (extracted from OAuth provider)';
COMMENT ON COLUMN integrations.username IS 'Username for the connected account (extracted from OAuth provider)';
COMMENT ON COLUMN integrations.account_name IS 'Display name for the connected account (extracted from OAuth provider)';
