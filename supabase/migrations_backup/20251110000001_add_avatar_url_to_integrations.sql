-- ================================================================
-- ADD AVATAR URL TO INTEGRATIONS
-- Created: 2025-11-10
-- Purpose: Add dedicated column for profile picture/avatar URL
--          to display user's connected account avatars in the UI
-- ================================================================

-- Add avatar_url column for storing profile picture URLs
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create index on avatar_url for faster lookups (optional, useful for filtering)
CREATE INDEX IF NOT EXISTS idx_integrations_avatar_url
  ON integrations(avatar_url)
  WHERE avatar_url IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN integrations.avatar_url IS 'Profile picture/avatar URL for the connected account (extracted from OAuth provider)';

-- Backfill existing data from metadata JSONB column
-- Extract avatar/picture URLs from metadata and populate the new column
UPDATE integrations
SET avatar_url = COALESCE(
  metadata->>'avatar_url',
  metadata->>'avatarUrl',
  metadata->>'avatar',
  metadata->>'picture',
  metadata->>'profile_image',
  metadata->>'profile_picture',
  metadata->>'photo'
)
WHERE
  avatar_url IS NULL
  AND (
    metadata->>'avatar_url' IS NOT NULL
    OR metadata->>'avatarUrl' IS NOT NULL
    OR metadata->>'avatar' IS NOT NULL
    OR metadata->>'picture' IS NOT NULL
    OR metadata->>'profile_image' IS NOT NULL
    OR metadata->>'profile_picture' IS NOT NULL
    OR metadata->>'photo' IS NOT NULL
  );
