-- Add missing columns to flow_v2_definitions for complete parity with legacy workflows table
-- This migration adds folder support, trash functionality, and other missing fields

-- Add folder support
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE SET NULL;

-- Add trash/deletion support
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add workflow status and visibility
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';

-- Add execution tracking
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS executions_count INTEGER DEFAULT 0;

-- Add template tracking
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS source_template_id UUID;

-- Add organization support (if not exists from parity migration)
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Add updated_at for tracking changes
ALTER TABLE public.flow_v2_definitions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_folder_id ON public.flow_v2_definitions(folder_id);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_owner_id ON public.flow_v2_definitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_workspace_id ON public.flow_v2_definitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_organization_id ON public.flow_v2_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_is_active ON public.flow_v2_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_flow_v2_definitions_status ON public.flow_v2_definitions(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_flow_v2_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for flow_v2_definitions
DROP TRIGGER IF EXISTS update_flow_v2_definitions_updated_at ON public.flow_v2_definitions;
CREATE TRIGGER update_flow_v2_definitions_updated_at
  BEFORE UPDATE ON public.flow_v2_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_flow_v2_definitions_updated_at();

-- Update RLS policies to handle folders and organization access
-- Note: Existing RLS policies from flow_v2_rbac migration should handle most of this
-- but we add folder-specific policies here

-- Allow users to see workflows in their folders
CREATE POLICY IF NOT EXISTS "Users can view workflows in their folders"
  ON public.flow_v2_definitions FOR SELECT
  USING (
    folder_id IN (
      SELECT id FROM public.workflow_folders
      WHERE user_id = auth.uid()
    )
  );
