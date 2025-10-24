-- Create workflow_folders table
CREATE TABLE IF NOT EXISTS public.workflow_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  parent_folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'folder',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add folder_id to workflows table
ALTER TABLE public.workflows
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_folders
CREATE POLICY "Users can view own folders"
  ON public.workflow_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own folders"
  ON public.workflow_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON public.workflow_folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON public.workflow_folders FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_folders_user_id ON public.workflow_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_folders_organization_id ON public.workflow_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent_folder_id ON public.workflow_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_workflows_folder_id ON public.workflows(folder_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for workflow_folders
CREATE TRIGGER update_workflow_folders_updated_at
  BEFORE UPDATE ON public.workflow_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_folders_updated_at();
