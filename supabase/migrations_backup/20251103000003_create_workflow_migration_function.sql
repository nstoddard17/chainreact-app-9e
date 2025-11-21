-- Migration: Workflow migration system for team deletion/suspension
-- When a team is deleted or suspended, migrate workflows back to creator's root folder

-- ============================================================================
-- FUNCTION: Get or create user's default folder
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_user_default_folder(target_user_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  default_folder_id UUID;
  user_email TEXT;
  folder_name TEXT;
BEGIN
  -- Try to find existing default folder
  SELECT id INTO default_folder_id
  FROM public.workflow_folders
  WHERE user_id = target_user_id
    AND is_default = TRUE
    AND team_id IS NULL
  LIMIT 1;

  -- If found, return it
  IF default_folder_id IS NOT NULL THEN
    RETURN default_folder_id;
  END IF;

  -- Otherwise, create one
  -- Get user email for folder name
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = target_user_id;

  -- Derive folder name from email
  IF user_email IS NOT NULL THEN
    folder_name := split_part(user_email, '@', 1) || '''s Workflows';
  ELSE
    folder_name := 'My Workflows';
  END IF;

  -- Create the default folder
  INSERT INTO public.workflow_folders (
    name,
    description,
    user_id,
    is_default,
    color,
    icon,
    created_at,
    updated_at
  ) VALUES (
    folder_name,
    'Default workspace',
    target_user_id,
    TRUE,
    '#3B82F6',
    'folder',
    NOW(),
    NOW()
  ) RETURNING id INTO default_folder_id;

  RETURN default_folder_id;
END;
$$;

COMMENT ON FUNCTION get_or_create_user_default_folder(UUID) IS 'Gets user''s default folder or creates one if it doesn''t exist';

-- ============================================================================
-- FUNCTION: Migrate team workflows back to creator's folder
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_team_workflows_to_creator()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  workflow_record RECORD;
  creator_default_folder_id UUID;
  migrated_count INTEGER := 0;
BEGIN
  -- Get or create the team creator's default folder
  creator_default_folder_id := get_or_create_user_default_folder(OLD.created_by);

  -- Log the migration start
  RAISE NOTICE 'Team % (id: %) being deleted. Migrating workflows to creator % default folder %',
    OLD.name, OLD.id, OLD.created_by, creator_default_folder_id;

  -- Migrate all workflows from this team to the creator's default folder
  FOR workflow_record IN
    SELECT id, name, user_id
    FROM public.workflows
    WHERE team_id = OLD.id
  LOOP
    -- Update workflow: remove team_id, set folder to creator's default
    UPDATE public.workflows
    SET
      team_id = NULL,
      folder_id = creator_default_folder_id,
      updated_at = NOW()
    WHERE id = workflow_record.id;

    migrated_count := migrated_count + 1;

    RAISE NOTICE 'Migrated workflow "%" (id: %) to creator''s folder', workflow_record.name, workflow_record.id;
  END LOOP;

  -- Migrate team folders to creator's personal folders
  UPDATE public.workflow_folders
  SET
    team_id = NULL,
    updated_at = NOW()
  WHERE team_id = OLD.id;

  RAISE NOTICE 'Migration complete: % workflows migrated from team % to creator % default folder',
    migrated_count, OLD.name, OLD.created_by;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION migrate_team_workflows_to_creator() IS 'Migrates team workflows back to creator''s root folder before team deletion';

-- ============================================================================
-- TRIGGER: Run workflow migration before team deletion
-- ============================================================================

DROP TRIGGER IF EXISTS migrate_workflows_before_team_delete ON public.teams;

CREATE TRIGGER migrate_workflows_before_team_delete
  BEFORE DELETE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION migrate_team_workflows_to_creator();

COMMENT ON TRIGGER migrate_workflows_before_team_delete ON public.teams IS 'Migrates team workflows to creator before deleting team';

-- ============================================================================
-- FUNCTION: Handle team suspension (mark workflows, don't delete)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_team_suspension()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If team is being suspended (suspended_at is newly set)
  IF NEW.suspended_at IS NOT NULL AND OLD.suspended_at IS NULL THEN
    RAISE NOTICE 'Team % (id: %) suspended. Reason: %. Workflows will be disabled.',
      NEW.name, NEW.id, NEW.suspension_reason;

    -- Note: Workflow execution engine should check team.suspended_at before running
    -- We don't delete or migrate workflows on suspension, only on deletion
  END IF;

  -- If team is being unsuspended (suspended_at is cleared)
  IF NEW.suspended_at IS NULL AND OLD.suspended_at IS NOT NULL THEN
    RAISE NOTICE 'Team % (id: %) reactivated. Workflows will be re-enabled.',
      NEW.name, NEW.id;

    -- Clear grace period and notification timestamps
    NEW.grace_period_ends_at := NULL;
    NEW.suspension_notified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_team_suspension() IS 'Logs team suspension/reactivation events';

-- ============================================================================
-- TRIGGER: Handle team suspension updates
-- ============================================================================

DROP TRIGGER IF EXISTS handle_team_suspension_trigger ON public.teams;

CREATE TRIGGER handle_team_suspension_trigger
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  WHEN (OLD.suspended_at IS DISTINCT FROM NEW.suspended_at)
  EXECUTE FUNCTION handle_team_suspension();

COMMENT ON TRIGGER handle_team_suspension_trigger ON public.teams IS 'Handles team suspension state changes';
