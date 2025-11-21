-- Migration: Team folder initialization system
-- Creates root and trash folders automatically when a team is created

-- ============================================================================
-- FUNCTION: Initialize folders for a new team
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_team_folders()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  root_folder_id UUID;
BEGIN
  -- Create root/default folder for team
  -- Use team_id as user_id so each team gets its own "user" space
  INSERT INTO public.workflow_folders (
    name,
    description,
    team_id,
    user_id, -- Set to team_id - treat team like a user
    is_default,
    color,
    icon,
    created_at,
    updated_at
  ) VALUES (
    NEW.name || '''s Workflows',
    'Default workspace for ' || NEW.name,
    NEW.id,
    NEW.id::text::uuid, -- Use team_id as user_id
    TRUE, -- This is the default folder for the team
    '#3B82F6', -- Blue color
    'folder',
    NOW(),
    NOW()
  ) RETURNING id INTO root_folder_id;

  -- Create trash folder for team
  INSERT INTO public.workflow_folders (
    name,
    description,
    team_id,
    user_id, -- Set to team_id - treat team like a user
    parent_folder_id,
    is_trash,
    color,
    icon,
    created_at,
    updated_at
  ) VALUES (
    'Trash',
    'Deleted workflows for ' || NEW.name,
    NEW.id,
    NEW.id::text::uuid, -- Use team_id as user_id
    root_folder_id,
    TRUE, -- This is the trash folder
    '#EF4444', -- Red color
    'trash',
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION initialize_team_folders() IS 'Automatically creates root and trash folders when a new team is created';

-- ============================================================================
-- TRIGGER: Run folder initialization on team creation
-- ============================================================================

DROP TRIGGER IF EXISTS initialize_team_folders_trigger ON public.teams;

CREATE TRIGGER initialize_team_folders_trigger
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION initialize_team_folders();

COMMENT ON TRIGGER initialize_team_folders_trigger ON public.teams IS 'Triggers folder creation when a team is created';

-- ============================================================================
-- BACKFILL: Create folders for existing teams without folders
-- ============================================================================

DO $$
DECLARE
  team_record RECORD;
  root_folder_id UUID;
BEGIN
  -- Find all teams that don't have a default folder
  FOR team_record IN
    SELECT t.id, t.name, t.created_by
    FROM public.teams t
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workflow_folders wf
      WHERE wf.team_id = t.id
      AND wf.is_default = TRUE
    )
  LOOP
    RAISE NOTICE 'Creating folders for team: % (id: %)', team_record.name, team_record.id;

    -- Create root folder
    -- Use team_id as user_id so each team gets its own "user" space
    INSERT INTO public.workflow_folders (
      name,
      description,
      team_id,
      user_id,
      is_default,
      color,
      icon,
      created_at,
      updated_at
    ) VALUES (
      team_record.name || '''s Workflows',
      'Default workspace for ' || team_record.name,
      team_record.id,
      team_record.id::text::uuid, -- Use team_id as user_id
      TRUE,
      '#3B82F6',
      'folder',
      NOW(),
      NOW()
    ) RETURNING id INTO root_folder_id;

    -- Create trash folder
    INSERT INTO public.workflow_folders (
      name,
      description,
      team_id,
      user_id,
      parent_folder_id,
      is_trash,
      color,
      icon,
      created_at,
      updated_at
    ) VALUES (
      'Trash',
      'Deleted workflows for ' || team_record.name,
      team_record.id,
      team_record.id::text::uuid, -- Use team_id as user_id
      root_folder_id,
      TRUE,
      '#EF4444',
      'trash',
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Created root folder (id: %) and trash folder for team: %', root_folder_id, team_record.name;
  END LOOP;
END $$;
