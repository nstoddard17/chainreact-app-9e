-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_members junction table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create workflow_teams junction table
CREATE TABLE IF NOT EXISTS workflow_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, team_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_workflow_teams_workflow_id ON workflow_teams(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_teams_team_id ON workflow_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies for teams
-- Users can view teams they are members of
CREATE POLICY "Users can view teams they belong to"
  ON teams FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can create teams (created_by is set by application)
CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Team owners and admins can update teams
CREATE POLICY "Team owners and admins can update teams"
  ON teams FOR UPDATE
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Team owners can delete teams
CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- RLS Policies for team_members
-- Users can view members of teams they belong to
CREATE POLICY "Users can view team members"
  ON team_members FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Team owners and admins can add members
-- Also allow adding the creator as owner (for the trigger)
CREATE POLICY "Team owners and admins can add members"
  ON team_members FOR INSERT
  WITH CHECK (
    -- Allow if user is already owner/admin of the team
    team_id IN (
      SELECT team_id FROM team_members tm
      WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    )
    OR
    -- Allow if adding yourself as owner to a team you created
    (user_id = auth.uid() AND role = 'owner' AND team_id IN (
      SELECT id FROM teams WHERE created_by = auth.uid()
    ))
  );

-- Team owners and admins can update member roles
CREATE POLICY "Team owners and admins can update members"
  ON team_members FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Team owners and admins can remove members
CREATE POLICY "Team owners and admins can remove members"
  ON team_members FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for workflow_teams
-- Users can view workflow shares for workflows they own or teams they belong to
CREATE POLICY "Users can view workflow team shares"
  ON workflow_teams FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Workflow owners can share workflows to teams they belong to
CREATE POLICY "Workflow owners can share to their teams"
  ON workflow_teams FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id = auth.uid()
    )
    AND
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

-- Workflow owners can unshare workflows
CREATE POLICY "Workflow owners can unshare workflows"
  ON workflow_teams FOR DELETE
  USING (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id = auth.uid()
    )
  );

-- Function to automatically add creator as team owner
CREATE OR REPLACE FUNCTION add_team_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to add creator as owner when team is created
CREATE TRIGGER on_team_created
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION add_team_creator_as_owner();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_teams_timestamp
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_teams_updated_at();
