-- Add RLS policies for team_members table
-- This allows users to view and manage team memberships

-- Enable RLS on team_members if not already enabled
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Allow users to view team_members for teams they belong to
CREATE POLICY "Users can view team members for their teams"
  ON team_members FOR SELECT
  USING (
    -- Can view members of teams where user is also a member
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
    )
  );

-- Allow team owners and admins to add members
CREATE POLICY "Team owners and admins can add members"
  ON team_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    )
  );

-- Allow team owners and admins to update member roles
CREATE POLICY "Team owners and admins can update members"
  ON team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    )
  );

-- Allow team owners and admins to remove members (or users can remove themselves)
CREATE POLICY "Team owners and admins can remove members"
  ON team_members FOR DELETE
  USING (
    -- Team owner/admin can remove anyone
    EXISTS (
      SELECT 1 FROM team_members AS tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    )
    OR
    -- Users can remove themselves
    team_members.user_id = auth.uid()
  );
