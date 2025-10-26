-- One-time migration to create default folders for all existing users
-- This script is safe to run multiple times (it checks if default folder already exists)

DO $$
DECLARE
  user_record RECORD;
  folder_count INTEGER;
BEGIN
  -- Loop through all users who don't have a default folder yet
  FOR user_record IN
    SELECT up.id, up.username
    FROM public.user_profiles up
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workflow_folders wf
      WHERE wf.user_id = up.id AND wf.is_default = TRUE
    )
  LOOP
    -- Create default folder for this user using their username
    INSERT INTO public.workflow_folders (
      user_id,
      name,
      description,
      color,
      icon,
      is_default,
      parent_folder_id
    ) VALUES (
      user_record.id,
      user_record.username || '''s Workflows',
      'Your default workflow folder',
      '#3B82F6',
      'folder',
      TRUE,
      NULL
    );

    RAISE NOTICE 'Created default folder for user: %', user_record.username;
  END LOOP;

  -- Get count of folders created
  SELECT COUNT(*) INTO folder_count
  FROM public.workflow_folders
  WHERE is_default = TRUE;

  RAISE NOTICE 'Total default folders in system: %', folder_count;
END $$;
