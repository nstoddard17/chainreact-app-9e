-- Add last_modified_by field to workflows table
-- This tracks which user last updated the workflow

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_workflows_last_modified_by ON public.workflows(last_modified_by);

-- Add comment
COMMENT ON COLUMN public.workflows.last_modified_by IS 'User ID of the person who last modified this workflow';

-- Update existing workflows to set last_modified_by to user_id (creator)
UPDATE public.workflows
SET last_modified_by = user_id
WHERE last_modified_by IS NULL;
