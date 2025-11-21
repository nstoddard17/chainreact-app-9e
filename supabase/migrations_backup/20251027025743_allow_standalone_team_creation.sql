-- Allow standalone team creation by updating RLS policies
-- This fixes the issue where users couldn't create teams without an organization_id

-- Drop existing INSERT policy for teams if it exists
DROP POLICY IF EXISTS "Users can insert teams in their organizations" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;

-- Create new INSERT policy that allows:
-- 1. Creating standalone teams (no organization_id) - user becomes owner
-- 2. Creating org teams (with organization_id) - bypass check (verified in API layer)
CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (
    -- Allow any authenticated user to create teams
    -- Verification of organization membership is handled at the API layer
    auth.uid() = created_by
  );

-- Ensure SELECT policy allows viewing teams user is member of
DROP POLICY IF EXISTS "Users can view their teams" ON teams;
DROP POLICY IF EXISTS "Users can view teams they are members of" ON teams;

CREATE POLICY "Users can view teams they are members of"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
    )
  );

-- Ensure UPDATE policy allows team admins/owners to update
DROP POLICY IF EXISTS "Team admins can update teams" ON teams;
DROP POLICY IF EXISTS "Team owners and admins can update teams" ON teams;

CREATE POLICY "Team owners and admins can update teams"
  ON teams FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin')
    )
  );

-- Ensure DELETE policy allows team owners to delete
DROP POLICY IF EXISTS "Team owners can delete teams" ON teams;

CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'owner'
    )
  );
