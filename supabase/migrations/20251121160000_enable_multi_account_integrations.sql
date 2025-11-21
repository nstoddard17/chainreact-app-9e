-- ================================================================
-- ENABLE MULTI-ACCOUNT INTEGRATIONS
-- Created: 2025-11-21
-- Purpose: Allow users to connect multiple accounts of the same provider
--          (e.g., work Gmail + personal Gmail in one workflow)
--          Matches Zapier's per-step account selection functionality
-- ================================================================

-- ================================================================
-- STEP 1: Remove the blocking unique constraint
-- ================================================================
-- The old constraint only allowed ONE integration per provider per user
-- This prevented connecting multiple Gmail accounts, etc.

ALTER TABLE integrations
DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;

-- ================================================================
-- STEP 2: Add new constraint preventing duplicate connections to SAME account
-- ================================================================
-- This constraint allows:
--   ✅ Multiple accounts: work@gmail.com + personal@gmail.com for same user
--   ✅ Same email in different workspaces: work@gmail.com (personal) + work@gmail.com (team)
-- This constraint prevents:
--   ❌ Duplicate connections: work@gmail.com connected twice in same workspace
--
-- Using NULLS NOT DISTINCT ensures NULL values are treated as equal (Postgres 15+)
-- This prevents a user from connecting the same "no-email" integration twice

ALTER TABLE integrations
ADD CONSTRAINT integrations_unique_account
UNIQUE NULLS NOT DISTINCT (user_id, provider, email, workspace_id);

-- ================================================================
-- STEP 3: Add provider_account_id column for non-email accounts
-- ================================================================
-- Some providers don't have email (Airtable, Trello, etc.)
-- Use provider_account_id as unique identifier when email is not available

ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS provider_account_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_provider_account_id
  ON integrations(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

-- Comment explaining the column
COMMENT ON COLUMN integrations.provider_account_id IS 'Unique account identifier from the provider (user_id, account_id, etc.) used when email is not available';

-- ================================================================
-- STEP 4: Add display_name column for account selector UI
-- ================================================================
-- For better UX in account dropdowns, store a display name

ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill display_name from existing data
UPDATE integrations
SET display_name = COALESCE(
  email,
  account_name,
  username,
  provider_account_id,
  provider || ' Account'
)
WHERE display_name IS NULL;

-- Comment explaining the column
COMMENT ON COLUMN integrations.display_name IS 'Human-readable name shown in account selector dropdowns';

-- ================================================================
-- STEP 5: Create indexes for multi-account queries
-- ================================================================

-- Index for finding all accounts of a provider for a user
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider
  ON integrations(user_id, provider);

-- Index for finding accounts by email
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider_email
  ON integrations(user_id, provider, email)
  WHERE email IS NOT NULL;

-- ================================================================
-- VERIFICATION QUERIES (for testing)
-- ================================================================

-- Show constraint was properly updated
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'integrations'::regclass
-- AND contype = 'u';

-- Count accounts per provider per user (should work now)
-- SELECT user_id, provider, COUNT(*) as account_count, array_agg(email)
-- FROM integrations
-- GROUP BY user_id, provider
-- HAVING COUNT(*) > 1;
