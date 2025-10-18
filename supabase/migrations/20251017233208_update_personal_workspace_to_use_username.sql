-- =====================================================
-- Update Personal Workspaces to Use Username
-- =====================================================
-- This migration updates personal workspace names to use
-- username instead of email, with fallback to email
-- =====================================================

-- Update the function to create personal workspace using username
CREATE OR REPLACE FUNCTION create_personal_workspace()
RETURNS TRIGGER AS $$
DECLARE
  personal_org_id UUID;
  user_profile RECORD;
  workspace_name TEXT;
  workspace_slug TEXT;
BEGIN
  -- Wait a moment for the profile to be created (profile trigger runs first)
  PERFORM pg_sleep(0.1);

  -- Get user profile data
  SELECT username, email INTO user_profile
  FROM user_profiles
  WHERE id = NEW.id;

  -- Create workspace name from username or email
  workspace_name := COALESCE(
    user_profile.username,
    split_part(NEW.email, '@', 1),
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

-- Update existing personal workspaces to use username
DO $$
DECLARE
  org_record RECORD;
  profile_record RECORD;
  new_name TEXT;
BEGIN
  -- Loop through all personal workspaces
  FOR org_record IN
    SELECT o.id, o.owner_id, o.name
    FROM organizations o
    WHERE o.is_personal = true
  LOOP
    -- Get the user's profile
    SELECT username, email INTO profile_record
    FROM user_profiles
    WHERE id = org_record.owner_id;

    -- Create new name from username or email
    new_name := COALESCE(
      profile_record.username,
      split_part(profile_record.email, '@', 1),
      'Personal'
    ) || '''s Workspace';

    -- Update the organization name if it's different
    IF new_name != org_record.name THEN
      UPDATE organizations
      SET name = new_name
      WHERE id = org_record.id;

      RAISE NOTICE 'Updated workspace % to %', org_record.name, new_name;
    END IF;
  END LOOP;
END $$;
