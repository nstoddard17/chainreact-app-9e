-- ================================================================
-- MAKE INTEGRATIONS USER_ID NULLABLE
-- Created: 2025-11-09
-- Purpose: Allow team/org integrations to have null user_id
-- ================================================================
--
-- Context:
-- The workspace integrations migration (20251028000001) added workspace_type,
-- workspace_id, and connected_by columns, enabling team/org integrations.
-- However, the original schema had user_id as NOT NULL, which prevents
-- team/org integrations from being created (they should have user_id = null
-- and use connected_by to track who connected them).
--
-- This migration makes user_id nullable to support the workspace pattern.

-- Drop the NOT NULL constraint on user_id
ALTER TABLE integrations
ALTER COLUMN user_id DROP NOT NULL;

-- Add a check constraint to ensure user_id is set for personal integrations
ALTER TABLE integrations
ADD CONSTRAINT integrations_user_id_check
CHECK (
  (workspace_type = 'personal' AND user_id IS NOT NULL)
  OR
  (workspace_type IN ('team', 'organization') AND user_id IS NULL)
);

-- ================================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================================

COMMENT ON COLUMN integrations.user_id IS 'User ID for personal integrations only. NULL for team/org integrations (use connected_by instead).';

-- ================================================================
-- VERIFICATION
-- ================================================================

-- Verify all personal integrations have user_id
-- SELECT COUNT(*) FROM integrations WHERE workspace_type = 'personal' AND user_id IS NULL;
-- Should return 0

-- Verify all team/org integrations have null user_id
-- SELECT COUNT(*) FROM integrations WHERE workspace_type IN ('team', 'organization') AND user_id IS NOT NULL;
-- Should return 0
