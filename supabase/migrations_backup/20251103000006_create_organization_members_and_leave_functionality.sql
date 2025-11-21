-- Migration: Organization members table and leave team/org functionality
-- Creates organization_members table, transfer ownership, and self-removal

-- ============================================================================
-- PART 1: Create organization_members table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'finance')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(organization_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id
  ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_role
  ON public.organization_members(role);

-- Enable RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Organization members can view org members"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization admins can insert members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'hr')
    )
  );

CREATE POLICY "Organization admins can update members"
  ON public.organization_members FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Organization admins can delete members"
  ON public.organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.organization_members IS 'Organization-level membership and roles';
COMMENT ON COLUMN public.organization_members.role IS 'Organization role: owner, admin, manager, hr, finance';

-- ============================================================================
-- PART 2: Migrate existing organization owners to organization_members
-- ============================================================================

-- Migrate organization owners to organization_members table
INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
SELECT
  id as organization_id,
  owner_id as user_id,
  'owner' as role,
  created_at
FROM public.organizations
WHERE owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = organizations.id
    AND om.user_id = organizations.owner_id
  )
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- ============================================================================
-- PART 3: Sync team members to organization members
-- ============================================================================

-- Function to sync team members to organization members
CREATE OR REPLACE FUNCTION sync_team_members_to_org()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Get the organization_id for this team
  SELECT organization_id INTO org_id
  FROM public.teams
  WHERE id = NEW.team_id;

  -- If team belongs to an organization, add user to organization_members
  IF org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role  -- Default to 'manager' level at org, team role is in team_members
    ) VALUES (
      org_id,
      NEW.user_id,
      'manager'  -- Default org role when joining via team
    )
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_team_members_to_org_trigger ON public.team_members;

CREATE TRIGGER sync_team_members_to_org_trigger
  AFTER INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_team_members_to_org();

COMMENT ON TRIGGER sync_team_members_to_org_trigger ON public.team_members IS 'Syncs team members to organization members when team is in an org';

-- ============================================================================
-- PART 4: Cleanup org members when team is removed from organization
-- ============================================================================

-- Function to check if user should be removed from organization
-- (only remove if they're not in any other teams in the org)
CREATE OR REPLACE FUNCTION cleanup_org_member_if_no_teams()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  org_id UUID;
  other_teams_count INT;
BEGIN
  -- Get the organization_id for this team
  SELECT organization_id INTO org_id
  FROM public.teams
  WHERE id = OLD.team_id;

  -- If team belongs to an organization
  IF org_id IS NOT NULL THEN
    -- Check if user is in any other teams in this organization
    SELECT COUNT(*) INTO other_teams_count
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = OLD.user_id
      AND t.organization_id = org_id
      AND tm.team_id != OLD.team_id;

    -- If user is not in any other teams, remove from organization_members
    -- BUT keep organization-level roles (owner, admin, etc)
    IF other_teams_count = 0 THEN
      DELETE FROM public.organization_members
      WHERE organization_id = org_id
        AND user_id = OLD.user_id
        AND role NOT IN ('owner', 'admin');  -- Keep org-level roles
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_org_member_trigger ON public.team_members;

CREATE TRIGGER cleanup_org_member_trigger
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_org_member_if_no_teams();

COMMENT ON TRIGGER cleanup_org_member_trigger ON public.team_members IS 'Removes user from organization if they leave all teams (preserves org-level roles)';

-- ============================================================================
-- PART 5: Log member removal activity
-- ============================================================================

-- Trigger to log when member leaves team
CREATE OR REPLACE FUNCTION log_member_left()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_email TEXT;
  team_name TEXT;
BEGIN
  -- Get user email and team name
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = OLD.user_id;

  SELECT name INTO team_name
  FROM public.teams
  WHERE id = OLD.team_id;

  -- Log the activity
  PERFORM log_team_activity(
    OLD.team_id,
    OLD.user_id,
    'member_left',
    user_email || ' left the team',
    jsonb_build_object(
      'user_email', user_email,
      'role', OLD.role,
      'team_name', team_name
    )
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS log_member_left_trigger ON public.team_members;

CREATE TRIGGER log_member_left_trigger
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION log_member_left();

COMMENT ON TRIGGER log_member_left_trigger ON public.team_members IS 'Logs when a member leaves a team';

-- ============================================================================
-- PART 6: Auto-delete team when last member leaves (and that member is owner)
-- ============================================================================

-- Function to delete team if last member (owner) leaves
CREATE OR REPLACE FUNCTION delete_team_if_last_member()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_members_count INT;
  team_owner_id UUID;
BEGIN
  -- Count remaining members in the team
  SELECT COUNT(*) INTO remaining_members_count
  FROM public.team_members
  WHERE team_id = OLD.team_id;

  -- Get team creator
  SELECT created_by INTO team_owner_id
  FROM public.teams
  WHERE id = OLD.team_id;

  -- If no members remain AND the person who left was the owner/creator
  IF remaining_members_count = 0 AND OLD.user_id = team_owner_id THEN
    -- Delete the team (this will cascade delete folders, workflows, etc.)
    DELETE FROM public.teams WHERE id = OLD.team_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_team_if_last_member_trigger ON public.team_members;

CREATE TRIGGER delete_team_if_last_member_trigger
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION delete_team_if_last_member();

COMMENT ON TRIGGER delete_team_if_last_member_trigger ON public.team_members IS 'Auto-deletes team when last member (owner) leaves';

-- ============================================================================
-- PART 7: Backfill existing team members to organization_members
-- ============================================================================

-- Backfill: Add all existing team members to their organization's members table
INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
SELECT DISTINCT
  t.organization_id,
  tm.user_id,
  'manager' as role,  -- Default org role for existing team members
  tm.joined_at as created_at
FROM public.team_members tm
JOIN public.teams t ON t.id = tm.team_id
WHERE t.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = t.organization_id
    AND om.user_id = tm.user_id
  )
ON CONFLICT (organization_id, user_id) DO NOTHING;
