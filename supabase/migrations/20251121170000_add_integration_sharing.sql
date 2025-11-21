-- ================================================================
-- ADD INTEGRATION SHARING SUPPORT
-- Created: 2025-11-21
-- Purpose: Enable Zapier-like team/organization sharing of integrations
--          Users can share their connected accounts with teams or everyone
-- ================================================================

-- ================================================================
-- STEP 1: Add sharing_scope column to integrations table
-- ================================================================
-- Defines who can use this integration:
-- - 'private': Only the owner can use it (default)
-- - 'team': Shared with specific teams
-- - 'organization': Shared with everyone in the organization

ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS sharing_scope TEXT DEFAULT 'private'
CHECK (sharing_scope IN ('private', 'team', 'organization'));

-- Add index for faster queries on sharing scope
CREATE INDEX IF NOT EXISTS idx_integrations_sharing_scope
  ON integrations(sharing_scope)
  WHERE sharing_scope != 'private';

-- Comment explaining the column
COMMENT ON COLUMN integrations.sharing_scope IS 'Who can use this integration: private (owner only), team (specific teams), organization (everyone)';

-- ================================================================
-- STEP 2: Create integration_shares table for team-level sharing
-- ================================================================
-- Tracks which teams/users have been granted access to an integration

CREATE TABLE IF NOT EXISTS integration_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Who shared it
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who it's shared with (one of these must be set)
  shared_with_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Permission level
  permission_level TEXT NOT NULL DEFAULT 'use'
    CHECK (permission_level IN ('use', 'manage', 'admin')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure at least one target is specified
  CONSTRAINT integration_shares_target_check
    CHECK (shared_with_team_id IS NOT NULL OR shared_with_user_id IS NOT NULL),

  -- Prevent duplicate shares
  CONSTRAINT integration_shares_unique_team
    UNIQUE NULLS NOT DISTINCT (integration_id, shared_with_team_id),
  CONSTRAINT integration_shares_unique_user
    UNIQUE NULLS NOT DISTINCT (integration_id, shared_with_user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_integration_shares_integration
  ON integration_shares(integration_id);

CREATE INDEX IF NOT EXISTS idx_integration_shares_team
  ON integration_shares(shared_with_team_id)
  WHERE shared_with_team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_shares_user
  ON integration_shares(shared_with_user_id)
  WHERE shared_with_user_id IS NOT NULL;

-- Comments
COMMENT ON TABLE integration_shares IS 'Tracks which teams/users have access to shared integrations';
COMMENT ON COLUMN integration_shares.permission_level IS 'use: can use in workflows, manage: can edit sharing, admin: full control';

-- ================================================================
-- STEP 3: Add shared_at timestamp to integrations
-- ================================================================
-- Track when an integration was first shared

ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;

COMMENT ON COLUMN integrations.shared_at IS 'When this integration was first shared with others';

-- ================================================================
-- STEP 4: Create RLS policies for integration_shares
-- ================================================================

-- Enable RLS
ALTER TABLE integration_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shares for integrations they own
CREATE POLICY "Users can view shares for their integrations"
  ON integration_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM integrations
      WHERE integrations.id = integration_shares.integration_id
      AND integrations.user_id = auth.uid()
    )
  );

-- Policy: Users can view shares where they are the recipient
CREATE POLICY "Users can view shares shared with them"
  ON integration_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Policy: Users can view shares for teams they belong to
CREATE POLICY "Users can view shares for their teams"
  ON integration_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = integration_shares.shared_with_team_id
      AND team_members.user_id = auth.uid()
    )
  );

-- Policy: Users can create shares for their own integrations
CREATE POLICY "Users can share their own integrations"
  ON integration_shares FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM integrations
      WHERE integrations.id = integration_shares.integration_id
      AND integrations.user_id = auth.uid()
    )
  );

-- Policy: Users can delete shares for their own integrations
CREATE POLICY "Users can unshare their own integrations"
  ON integration_shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM integrations
      WHERE integrations.id = integration_shares.integration_id
      AND integrations.user_id = auth.uid()
    )
  );

-- Policy: Users can update shares for their own integrations
CREATE POLICY "Users can update shares for their integrations"
  ON integration_shares FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM integrations
      WHERE integrations.id = integration_shares.integration_id
      AND integrations.user_id = auth.uid()
    )
  );

-- ================================================================
-- STEP 5: Create helper function to get accessible integrations
-- ================================================================
-- Returns all integrations a user can access (owned + shared)

CREATE OR REPLACE FUNCTION get_accessible_integrations(p_user_id UUID, p_provider TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  status TEXT,
  email TEXT,
  username TEXT,
  account_name TEXT,
  avatar_url TEXT,
  display_name TEXT,
  workspace_type TEXT,
  workspace_id UUID,
  sharing_scope TEXT,
  owner_id UUID,
  access_type TEXT,  -- 'owned', 'shared_direct', 'shared_team', 'shared_org'
  permission_level TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Owned integrations
  SELECT
    i.id,
    i.provider,
    i.status,
    i.email,
    i.username,
    i.account_name,
    i.avatar_url,
    i.display_name,
    i.workspace_type,
    i.workspace_id,
    i.sharing_scope,
    i.user_id as owner_id,
    'owned'::TEXT as access_type,
    'admin'::TEXT as permission_level
  FROM integrations i
  WHERE i.user_id = p_user_id
    AND (p_provider IS NULL OR i.provider = p_provider)
    AND i.status = 'connected'

  UNION ALL

  -- Directly shared with user
  SELECT
    i.id,
    i.provider,
    i.status,
    i.email,
    i.username,
    i.account_name,
    i.avatar_url,
    i.display_name,
    i.workspace_type,
    i.workspace_id,
    i.sharing_scope,
    i.user_id as owner_id,
    'shared_direct'::TEXT as access_type,
    COALESCE(s.permission_level, 'use')::TEXT as permission_level
  FROM integrations i
  JOIN integration_shares s ON s.integration_id = i.id
  WHERE s.shared_with_user_id = p_user_id
    AND i.user_id != p_user_id  -- Don't duplicate owned
    AND (p_provider IS NULL OR i.provider = p_provider)
    AND i.status = 'connected'

  UNION ALL

  -- Shared via team membership
  SELECT DISTINCT
    i.id,
    i.provider,
    i.status,
    i.email,
    i.username,
    i.account_name,
    i.avatar_url,
    i.display_name,
    i.workspace_type,
    i.workspace_id,
    i.sharing_scope,
    i.user_id as owner_id,
    'shared_team'::TEXT as access_type,
    COALESCE(s.permission_level, 'use')::TEXT as permission_level
  FROM integrations i
  JOIN integration_shares s ON s.integration_id = i.id
  JOIN team_members tm ON tm.team_id = s.shared_with_team_id
  WHERE tm.user_id = p_user_id
    AND i.user_id != p_user_id  -- Don't duplicate owned
    AND (p_provider IS NULL OR i.provider = p_provider)
    AND i.status = 'connected'

  UNION ALL

  -- Shared with entire organization
  SELECT
    i.id,
    i.provider,
    i.status,
    i.email,
    i.username,
    i.account_name,
    i.avatar_url,
    i.display_name,
    i.workspace_type,
    i.workspace_id,
    i.sharing_scope,
    i.user_id as owner_id,
    'shared_org'::TEXT as access_type,
    'use'::TEXT as permission_level
  FROM integrations i
  WHERE i.sharing_scope = 'organization'
    AND i.user_id != p_user_id  -- Don't duplicate owned
    AND (p_provider IS NULL OR i.provider = p_provider)
    AND i.status = 'connected'
    -- User must be in the same organization (via team membership)
    AND EXISTS (
      SELECT 1 FROM team_members tm1
      JOIN team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = p_user_id
        AND tm2.user_id = i.user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_accessible_integrations TO authenticated;

COMMENT ON FUNCTION get_accessible_integrations IS 'Returns all integrations a user can access (owned + shared with them)';

-- ================================================================
-- STEP 6: Update trigger for updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION update_integration_shares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_integration_shares_updated_at ON integration_shares;
CREATE TRIGGER trigger_integration_shares_updated_at
  BEFORE UPDATE ON integration_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_shares_updated_at();
