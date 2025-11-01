-- ================================================================
-- WORKSPACE INTEGRATION MANAGEMENT
-- Created: 2025-10-28
-- Purpose: Add workspace context to integrations and permission system
-- ================================================================

-- ================================================================
-- ADD WORKSPACE CONTEXT TO INTEGRATIONS
-- ================================================================

-- Add workspace columns to integrations table
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS workspace_type TEXT
  CHECK (workspace_type IN ('personal', 'organization', 'team')),
ADD COLUMN IF NOT EXISTS workspace_id UUID,
ADD COLUMN IF NOT EXISTS connected_by UUID REFERENCES auth.users(id);

-- Backfill existing integrations as 'personal'
-- All current integrations are user-owned, so they become personal
UPDATE integrations
SET
  workspace_type = 'personal',
  workspace_id = NULL,
  connected_by = user_id
WHERE workspace_type IS NULL;

-- Make workspace_type NOT NULL after backfill
ALTER TABLE integrations
ALTER COLUMN workspace_type SET NOT NULL,
ALTER COLUMN workspace_type SET DEFAULT 'personal';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrations_workspace
  ON integrations(workspace_type, workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integrations_workspace_type
  ON integrations(workspace_type);

CREATE INDEX IF NOT EXISTS idx_integrations_connected_by
  ON integrations(connected_by)
  WHERE connected_by IS NOT NULL;

-- ================================================================
-- CREATE INTEGRATION PERMISSIONS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS integration_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('use', 'manage', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(integration_id, user_id)
);

-- Add indexes for permission lookups
CREATE INDEX IF NOT EXISTS idx_integration_permissions_user
  ON integration_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_integration_permissions_integration
  ON integration_permissions(integration_id);

CREATE INDEX IF NOT EXISTS idx_integration_permissions_user_integration
  ON integration_permissions(user_id, integration_id);

-- ================================================================
-- RLS POLICIES FOR INTEGRATION PERMISSIONS
-- ================================================================

ALTER TABLE integration_permissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
  ON integration_permissions FOR SELECT
  USING (user_id = auth.uid());

-- Admins can insert permissions
CREATE POLICY "Admins can grant permissions"
  ON integration_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM integration_permissions ip
      WHERE ip.integration_id = integration_permissions.integration_id
      AND ip.user_id = auth.uid()
      AND ip.permission = 'admin'
    )
    OR
    -- Allow initial permission grant by integration owner
    NOT EXISTS (
      SELECT 1 FROM integration_permissions ip
      WHERE ip.integration_id = integration_permissions.integration_id
    )
  );

-- Admins can update permissions
CREATE POLICY "Admins can update permissions"
  ON integration_permissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM integration_permissions ip
      WHERE ip.integration_id = integration_permissions.integration_id
      AND ip.user_id = auth.uid()
      AND ip.permission = 'admin'
    )
  );

-- Admins can delete permissions
CREATE POLICY "Admins can revoke permissions"
  ON integration_permissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM integration_permissions ip
      WHERE ip.integration_id = integration_permissions.integration_id
      AND ip.user_id = auth.uid()
      AND ip.permission = 'admin'
    )
  );

-- ================================================================
-- HELPER FUNCTIONS FOR PERMISSION CHECKS
-- ================================================================

-- Get user's permission level for an integration
CREATE OR REPLACE FUNCTION get_user_integration_permission(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_permission TEXT;
BEGIN
  SELECT permission INTO v_permission
  FROM integration_permissions
  WHERE user_id = p_user_id
  AND integration_id = p_integration_id;

  RETURN v_permission;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can use integration (any permission level)
CREATE OR REPLACE FUNCTION can_user_use_integration(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM integration_permissions
    WHERE user_id = p_user_id
    AND integration_id = p_integration_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can manage integration (manage or admin permission)
CREATE OR REPLACE FUNCTION can_user_manage_integration(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM integration_permissions
    WHERE user_id = p_user_id
    AND integration_id = p_integration_id
    AND permission IN ('manage', 'admin')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can admin integration (admin permission only)
CREATE OR REPLACE FUNCTION can_user_admin_integration(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM integration_permissions
    WHERE user_id = p_user_id
    AND integration_id = p_integration_id
    AND permission = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get list of admins for an integration (for permission denial messages)
CREATE OR REPLACE FUNCTION get_integration_admins(
  p_integration_id UUID
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ip.user_id,
    p.email,
    p.full_name
  FROM integration_permissions ip
  INNER JOIN profiles p ON p.id = ip.user_id
  WHERE ip.integration_id = p_integration_id
  AND ip.permission = 'admin'
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_integration_permission TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_use_integration TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_manage_integration TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_admin_integration TO authenticated;
GRANT EXECUTE ON FUNCTION get_integration_admins TO authenticated;

-- ================================================================
-- BACKFILL PERMISSIONS FOR EXISTING INTEGRATIONS
-- ================================================================

-- Grant 'admin' permission to all existing integration owners
-- This ensures backward compatibility - users keep full control of their existing integrations
INSERT INTO integration_permissions (integration_id, user_id, permission, granted_by)
SELECT id, user_id, 'admin', user_id
FROM integrations
WHERE user_id IS NOT NULL
ON CONFLICT (integration_id, user_id) DO NOTHING;

-- ================================================================
-- UPDATE INTEGRATIONS RLS POLICIES
-- ================================================================

-- Drop existing policies if they conflict
DROP POLICY IF EXISTS "Users can view own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can insert own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can update own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can delete own integrations" ON integrations;

-- Users can view integrations they have permission to use
CREATE POLICY "Users can view accessible integrations"
  ON integrations FOR SELECT
  USING (
    -- Personal integrations (backward compatibility)
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR
    -- Any integration they have permission for
    EXISTS (
      SELECT 1 FROM integration_permissions
      WHERE integration_permissions.integration_id = integrations.id
      AND integration_permissions.user_id = auth.uid()
    )
  );

-- Users can insert integrations in their workspace context
CREATE POLICY "Users can create integrations"
  ON integrations FOR INSERT
  WITH CHECK (
    -- Personal integrations
    (workspace_type = 'personal' AND user_id = auth.uid() AND connected_by = auth.uid())
    OR
    -- Team integrations (must be team member with appropriate role)
    (
      workspace_type = 'team'
      AND workspace_id IS NOT NULL
      AND connected_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workspace_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
      )
    )
    OR
    -- Organization integrations (must be org admin)
    (
      workspace_type = 'organization'
      AND workspace_id IS NOT NULL
      AND connected_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM organizations
        WHERE organizations.id = workspace_id
        AND organizations.owner_id = auth.uid()
      )
    )
  );

-- Users can update integrations they have admin permission for
CREATE POLICY "Users can update managed integrations"
  ON integrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM integration_permissions
      WHERE integration_permissions.integration_id = integrations.id
      AND integration_permissions.user_id = auth.uid()
      AND integration_permissions.permission = 'admin'
    )
  );

-- Users can delete integrations they have admin permission for
CREATE POLICY "Users can delete managed integrations"
  ON integrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM integration_permissions
      WHERE integration_permissions.integration_id = integrations.id
      AND integration_permissions.user_id = auth.uid()
      AND integration_permissions.permission = 'admin'
    )
  );

-- ================================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================================

COMMENT ON COLUMN integrations.workspace_type IS 'Scope of the integration: personal (user-owned), team (team-shared), organization (org-wide)';
COMMENT ON COLUMN integrations.workspace_id IS 'ID of the team or organization (NULL for personal)';
COMMENT ON COLUMN integrations.connected_by IS 'User who connected this integration';

COMMENT ON TABLE integration_permissions IS 'Permission system for workspace integrations. Allows fine-grained access control (use/manage/admin).';
COMMENT ON COLUMN integration_permissions.permission IS 'Permission level: use (can use in workflows), manage (can reconnect), admin (full control)';

-- ================================================================
-- VERIFICATION QUERIES (for testing)
-- ================================================================

-- Check workspace_type distribution
-- SELECT workspace_type, COUNT(*) FROM integrations GROUP BY workspace_type;

-- Check permission distribution
-- SELECT permission, COUNT(*) FROM integration_permissions GROUP BY permission;

-- Verify all personal integrations have admin permission
-- SELECT i.id, i.provider, i.user_id, ip.permission
-- FROM integrations i
-- LEFT JOIN integration_permissions ip ON i.id = ip.integration_id AND i.user_id = ip.user_id
-- WHERE i.workspace_type = 'personal';
