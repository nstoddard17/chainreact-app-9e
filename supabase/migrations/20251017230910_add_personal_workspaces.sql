-- =====================================================
-- Personal Workspaces Migration
-- =====================================================
-- This migration adds personal workspaces that are auto-created
-- on user signup, following the pattern of Notion, Linear, Figma, etc.
-- =====================================================

-- Add is_personal flag to organizations table
ALTER TABLE organizations
  ADD COLUMN is_personal BOOLEAN NOT NULL DEFAULT false;

-- Create index for personal workspaces
CREATE INDEX IF NOT EXISTS idx_organizations_is_personal ON organizations(is_personal);

-- Update RLS policies to allow personal workspace operations
-- Users can always view their personal workspace
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    -- Can view if member of organization
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    OR
    -- Can view own personal workspace
    (is_personal = true AND owner_id = auth.uid())
  );

-- Function to create personal workspace for new users
CREATE OR REPLACE FUNCTION create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  personal_org_id UUID;
  user_email TEXT;
  workspace_name TEXT;
  workspace_slug TEXT;
BEGIN
  -- Get user email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;

  -- Create workspace name and slug from email
  workspace_name := COALESCE(
    split_part(user_email, '@', 1),
    'Personal'
  ) || '''s Workspace';

  workspace_slug := 'personal-' || NEW.id::text;

  -- Create personal organization
  INSERT INTO organizations (
    name,
    slug,
    description,
    owner_id,
    is_personal
  ) VALUES (
    workspace_name,
    workspace_slug,
    'Your personal workspace',
    NEW.id,
    true
  )
  RETURNING id INTO personal_org_id;

  -- Add user as owner in organization_members
  -- (The existing trigger will also add them, but this ensures it happens)
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    personal_org_id,
    NEW.id,
    'owner'
  )
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create personal workspace on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_personal_workspace();

-- =====================================================
-- Backfill existing users with personal workspaces
-- =====================================================

DO $$
DECLARE
  user_record RECORD;
  personal_org_id UUID;
  user_email TEXT;
  workspace_name TEXT;
  workspace_slug TEXT;
BEGIN
  -- Loop through all users who don't have a personal workspace
  FOR user_record IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.owner_id = u.id
      AND o.is_personal = true
    )
  LOOP
    -- Create workspace name and slug
    workspace_name := COALESCE(
      split_part(user_record.email, '@', 1),
      'Personal'
    ) || '''s Workspace';

    workspace_slug := 'personal-' || user_record.id::text;

    -- Create personal organization
    INSERT INTO organizations (
      name,
      slug,
      description,
      owner_id,
      is_personal
    ) VALUES (
      workspace_name,
      workspace_slug,
      'Your personal workspace',
      user_record.id,
      true
    )
    RETURNING id INTO personal_org_id;

    -- Add user as owner
    INSERT INTO organization_members (
      organization_id,
      user_id,
      role
    ) VALUES (
      personal_org_id,
      user_record.id,
      'owner'
    )
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    RAISE NOTICE 'Created personal workspace for user %', user_record.email;
  END LOOP;
END $$;

-- =====================================================
-- Update policies to prevent deletion of personal workspaces
-- =====================================================

DROP POLICY IF EXISTS "Org owners can delete organizations" ON organizations;
CREATE POLICY "Org owners can delete organizations"
  ON organizations FOR DELETE
  USING (
    -- Can only delete non-personal organizations
    is_personal = false
    AND id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- Update organizations table to prevent transfer of personal workspaces
DROP POLICY IF EXISTS "Org owners and admins can update organizations" ON organizations;
CREATE POLICY "Org owners and admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Prevent changing owner_id on personal workspaces
    (is_personal = false OR owner_id = (SELECT owner_id FROM organizations WHERE id = organizations.id))
  );

-- Add comment
COMMENT ON COLUMN organizations.is_personal IS 'Whether this is a personal workspace (auto-created on signup, cannot be deleted or transferred)';
