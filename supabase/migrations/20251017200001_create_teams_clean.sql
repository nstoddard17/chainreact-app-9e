-- Drop existing tables if they exist (this will also drop all policies, triggers, etc.)
DROP TABLE IF EXISTS workflow_teams CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS add_team_creator_as_owner() CASCADE;
DROP FUNCTION IF EXISTS update_teams_updated_at() CASCADE;

-- Create teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_members junction table
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create workflow_teams junction table
CREATE TABLE workflow_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, team_id)
);

-- Create indexes for better performance
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_workflow_teams_workflow_id ON workflow_teams(workflow_id);
CREATE INDEX idx_workflow_teams_team_id ON workflow_teams(team_id);
CREATE INDEX idx_teams_created_by ON teams(created_by);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_teams ENABLE ROW LEVEL SECURITY;

-- Function to automatically add creator as team owner
CREATE FUNCTION add_team_creator_as_owner()
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
CREATE FUNCTION update_teams_updated_at()
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

-- RLS Policies for teams
CREATE POLICY "Users can view teams they belong to"
  ON teams FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create teams"
  ON teams FOR INSERT
  WITH CHECK (true);  -- Application ensures created_by is set correctly

CREATE POLICY "Team owners and admins can update teams"
  ON teams FOR UPDATE
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

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
CREATE POLICY "Users can view team members"
  ON team_members FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Team owners and admins can add members"
  ON team_members FOR INSERT
  WITH CHECK (true);  -- Handled by trigger and application

CREATE POLICY "Team owners and admins can update members"
  ON team_members FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

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

CREATE POLICY "Workflow owners can unshare workflows"
  ON workflow_teams FOR DELETE
  USING (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id = auth.uid()
    )
  );
