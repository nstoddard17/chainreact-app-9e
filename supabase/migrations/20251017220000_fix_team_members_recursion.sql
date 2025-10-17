-- =====================================================
-- Fix Team Members RLS Infinite Recursion
-- =====================================================
-- This migration fixes the infinite recursion issue in team_members
-- policies by using security definer functions
-- =====================================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Team owners and admins can add members" ON team_members;
DROP POLICY IF EXISTS "Team owners and admins can update members" ON team_members;
DROP POLICY IF EXISTS "Team owners and admins can remove members" ON team_members;

-- Create helper function to check if user is team member (bypasses RLS)
CREATE OR REPLACE FUNCTION is_team_member(check_team_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user has admin rights in team (bypasses RLS)
CREATE OR REPLACE FUNCTION is_team_admin(check_team_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = check_user_id
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if team belongs to user's organization
CREATE OR REPLACE FUNCTION user_can_access_team(check_team_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teams t
    INNER JOIN organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = check_team_id
    AND om.user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies using security definer functions (no recursion)

-- Users can view members of teams they belong to
CREATE POLICY "Users can view team members"
  ON team_members FOR SELECT
  USING (
    is_team_member(team_id, auth.uid())
  );

-- Team owners and admins can add members (uses security definer to avoid recursion)
CREATE POLICY "Team owners and admins can add members"
  ON team_members FOR INSERT
  WITH CHECK (
    -- Allow if user is admin of the team
    is_team_admin(team_id, auth.uid())
    OR
    -- Allow if this is the team creator being added as owner (for trigger)
    (user_id = auth.uid() AND role = 'owner' AND EXISTS (
      SELECT 1 FROM teams WHERE id = team_id AND created_by = auth.uid()
    ))
  );

-- Team owners and admins can update member roles
CREATE POLICY "Team owners and admins can update members"
  ON team_members FOR UPDATE
  USING (
    is_team_admin(team_id, auth.uid())
  );

-- Team owners and admins can remove members
CREATE POLICY "Team owners and admins can remove members"
  ON team_members FOR DELETE
  USING (
    is_team_admin(team_id, auth.uid())
  );

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION is_team_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_team_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_can_access_team(UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION is_team_member(UUID, UUID) IS 'Security definer function to check team membership without RLS recursion';
COMMENT ON FUNCTION is_team_admin(UUID, UUID) IS 'Security definer function to check team admin rights without RLS recursion';
COMMENT ON FUNCTION user_can_access_team(UUID, UUID) IS 'Security definer function to check organization-based team access without RLS recursion';
