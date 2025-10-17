-- =====================================================
-- Data Migration: Existing Data to Organizations
-- =====================================================
-- This migration creates personal organizations for all existing users
-- and migrates their teams and workflows to those organizations.
-- =====================================================

-- Step 1: Create personal organizations for all existing users
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
  org_slug TEXT;
  user_email TEXT;
  user_name TEXT;
BEGIN
  FOR user_record IN
    SELECT DISTINCT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_members om WHERE om.user_id = u.id
    )
  LOOP
    -- Get user's name from metadata or use email
    user_name := COALESCE(
      user_record.raw_user_meta_data->>'full_name',
      user_record.raw_user_meta_data->>'name',
      split_part(user_record.email, '@', 1)
    );

    -- Generate unique slug
    org_slug := generate_organization_slug(user_name || '''s Workspace');

    -- Create organization for this user
    INSERT INTO organizations (name, slug, description, owner_id, deployment_type, plan_type)
    VALUES (
      user_name || '''s Workspace',
      org_slug,
      'Personal workspace',
      user_record.id,
      'cloud',
      'free'
    )
    RETURNING id INTO new_org_id;

    -- The trigger will automatically add them as owner, but let's be explicit
    -- (The trigger should have already done this, but just in case)
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (new_org_id, user_record.id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    RAISE NOTICE 'Created organization % for user %', new_org_id, user_record.email;
  END LOOP;
END $$;

-- Step 2: Assign all teams to their creator's organization
DO $$
DECLARE
  team_record RECORD;
  user_org_id UUID;
BEGIN
  FOR team_record IN
    SELECT t.id, t.created_by
    FROM teams t
    WHERE t.organization_id IS NULL
  LOOP
    -- Find the user's organization (they should only have one at this point)
    SELECT om.organization_id INTO user_org_id
    FROM organization_members om
    WHERE om.user_id = team_record.created_by
    AND om.role = 'owner'
    LIMIT 1;

    IF user_org_id IS NOT NULL THEN
      -- Assign team to this organization
      UPDATE teams
      SET organization_id = user_org_id
      WHERE id = team_record.id;

      RAISE NOTICE 'Assigned team % to organization %', team_record.id, user_org_id;
    ELSE
      RAISE WARNING 'Could not find organization for team % (created_by: %)', team_record.id, team_record.created_by;
    END IF;
  END LOOP;
END $$;

-- Step 3: Assign all workflows to their owner's organization
DO $$
DECLARE
  workflow_record RECORD;
  user_org_id UUID;
BEGIN
  FOR workflow_record IN
    SELECT w.id, w.user_id
    FROM workflows w
    WHERE w.organization_id IS NULL
  LOOP
    -- Find the user's organization
    SELECT om.organization_id INTO user_org_id
    FROM organization_members om
    WHERE om.user_id = workflow_record.user_id
    AND om.role = 'owner'
    LIMIT 1;

    IF user_org_id IS NOT NULL THEN
      -- Assign workflow to this organization
      UPDATE workflows
      SET organization_id = user_org_id
      WHERE id = workflow_record.id;

      RAISE NOTICE 'Assigned workflow % to organization %', workflow_record.id, user_org_id;
    ELSE
      RAISE WARNING 'Could not find organization for workflow % (user_id: %)', workflow_record.id, workflow_record.user_id;
    END IF;
  END LOOP;
END $$;

-- Step 4: Make organization_id NOT NULL now that data is migrated
-- (Commented out for safety - uncomment after verifying migration)
-- ALTER TABLE teams ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE workflows ALTER COLUMN organization_id SET NOT NULL;

-- Step 5: Verify migration results
DO $$
DECLARE
  org_count INT;
  teams_without_org INT;
  workflows_without_org INT;
BEGIN
  SELECT COUNT(*) INTO org_count FROM organizations;
  SELECT COUNT(*) INTO teams_without_org FROM teams WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO workflows_without_org FROM workflows WHERE organization_id IS NULL;

  RAISE NOTICE '=== Migration Summary ===';
  RAISE NOTICE 'Total organizations created: %', org_count;
  RAISE NOTICE 'Teams without organization: %', teams_without_org;
  RAISE NOTICE 'Workflows without organization: %', workflows_without_org;

  IF teams_without_org > 0 THEN
    RAISE WARNING 'Some teams still do not have an organization_id!';
  END IF;

  IF workflows_without_org > 0 THEN
    RAISE WARNING 'Some workflows still do not have an organization_id!';
  END IF;

  IF teams_without_org = 0 AND workflows_without_org = 0 THEN
    RAISE NOTICE 'Migration completed successfully! All data has been migrated.';
  END IF;
END $$;
