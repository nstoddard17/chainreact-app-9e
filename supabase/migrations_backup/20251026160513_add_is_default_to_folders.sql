-- Add is_default column to workflow_folders
ALTER TABLE public.workflow_folders
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Add unique constraint to ensure only one default folder per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_folders_user_default
ON public.workflow_folders(user_id)
WHERE is_default = TRUE;

-- Create a function to auto-create default folder for new users
-- This function will be called by application code when needed
CREATE OR REPLACE FUNCTION create_default_workflow_folder_for_user(user_id_param UUID, user_email TEXT)
RETURNS UUID AS $$
DECLARE
  username TEXT;
  folder_id UUID;
BEGIN
  -- Get username from email (part before @)
  username := SPLIT_PART(user_email, '@', 1);

  -- Check if default folder already exists
  SELECT id INTO folder_id
  FROM public.workflow_folders
  WHERE user_id = user_id_param AND is_default = TRUE
  LIMIT 1;

  -- If no default folder exists, create one
  IF folder_id IS NULL THEN
    INSERT INTO public.workflow_folders (
      user_id,
      name,
      description,
      color,
      icon,
      is_default,
      parent_folder_id
    ) VALUES (
      user_id_param,
      username || '''s Workflows',
      'Your default workflow folder',
      '#3B82F6',
      'folder',
      TRUE,
      NULL
    )
    RETURNING id INTO folder_id;
  END IF;

  RETURN folder_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
