-- ============================================================================
-- Workflow Workspace Context Migration
-- ============================================================================
-- Purpose: Add workspace context and permissions to workflows
-- Pattern: Follows same structure as integrations (20251028000001)
--
-- Changes:
--   1. Add workspace_type column to workflows
--   2. Create workflow_permissions table
--   3. Backfill existing workflows with workspace context
--   4. Create helper functions for permission management
--
-- Dependencies:
--   - workflows table must exist
--   - workspace_id column already exists
--   - team_id column already exists
-- ============================================================================

-- ============================================================================
-- STEP 1: Add workspace_type column to workflows
-- ============================================================================

-- Add workspace_type column (similar to integrations)
ALTER TABLE public.workflows
ADD COLUMN IF NOT EXISTS workspace_type text
  CHECK (workspace_type IN ('personal', 'team', 'organization'))
  DEFAULT 'personal';

-- Add created_by column to track who created the workflow
ALTER TABLE public.workflows
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS workflows_workspace_type_idx
  ON public.workflows (workspace_type);

CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx
  ON public.workflows (workspace_id);

CREATE INDEX IF NOT EXISTS workflows_created_by_idx
  ON public.workflows (created_by);

CREATE INDEX IF NOT EXISTS workflows_workspace_context_idx
  ON public.workflows (workspace_type, workspace_id);

-- ============================================================================
-- STEP 2: Create workflow_permissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workflow_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('use', 'manage', 'admin')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  -- Ensure one permission per user per workflow
  UNIQUE (workflow_id, user_id)
);

-- Indexes for workflow_permissions
CREATE INDEX IF NOT EXISTS workflow_permissions_workflow_id_idx
  ON public.workflow_permissions (workflow_id);

CREATE INDEX IF NOT EXISTS workflow_permissions_user_id_idx
  ON public.workflow_permissions (user_id);

CREATE INDEX IF NOT EXISTS workflow_permissions_lookup_idx
  ON public.workflow_permissions (workflow_id, user_id);

-- Enable RLS
ALTER TABLE public.workflow_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_permissions
CREATE POLICY "Users can view their own workflow permissions"
  ON public.workflow_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage workflow permissions"
  ON public.workflow_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_permissions wp
      WHERE wp.workflow_id = workflow_permissions.workflow_id
        AND wp.user_id = auth.uid()
        AND wp.permission = 'admin'
    )
  );

-- ============================================================================
-- STEP 3: Backfill existing workflows with workspace context
-- ============================================================================

-- Set workspace_type to 'personal' for all existing workflows
-- and set created_by to the user_id
UPDATE public.workflows
SET
  workspace_type = 'personal',
  created_by = user_id
WHERE workspace_type IS NULL;

-- ============================================================================
-- STEP 4: Create permissions for all existing workflows
-- ============================================================================

-- Grant admin permission to workflow owners
INSERT INTO public.workflow_permissions (workflow_id, user_id, permission, granted_by)
SELECT
  w.id,
  w.user_id,
  'admin',
  w.user_id
FROM public.workflows w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_permissions wp
  WHERE wp.workflow_id = w.id AND wp.user_id = w.user_id
);

-- ============================================================================
-- STEP 5: Helper Functions
-- ============================================================================

-- Function to check if user has permission for a workflow
CREATE OR REPLACE FUNCTION public.user_has_workflow_permission(
  p_workflow_id uuid,
  p_user_id uuid,
  p_required_permission text DEFAULT 'use'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission text;
  v_permission_level int;
  v_required_level int;
BEGIN
  -- Permission hierarchy: admin > manage > use
  -- Map permissions to levels
  v_required_level := CASE p_required_permission
    WHEN 'admin' THEN 3
    WHEN 'manage' THEN 2
    WHEN 'use' THEN 1
    ELSE 0
  END;

  -- Get user's permission
  SELECT permission INTO v_permission
  FROM public.workflow_permissions
  WHERE workflow_id = p_workflow_id
    AND user_id = p_user_id;

  -- If no permission found, user doesn't have access
  IF v_permission IS NULL THEN
    RETURN false;
  END IF;

  -- Map user's permission to level
  v_permission_level := CASE v_permission
    WHEN 'admin' THEN 3
    WHEN 'manage' THEN 2
    WHEN 'use' THEN 1
    ELSE 0
  END;

  -- Check if user's permission meets required level
  RETURN v_permission_level >= v_required_level;
END;
$$;

-- Function to grant workflow permission
CREATE OR REPLACE FUNCTION public.grant_workflow_permission(
  p_workflow_id uuid,
  p_user_id uuid,
  p_permission text,
  p_granted_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission_id uuid;
BEGIN
  -- Insert or update permission
  INSERT INTO public.workflow_permissions (workflow_id, user_id, permission, granted_by)
  VALUES (p_workflow_id, p_user_id, p_permission, p_granted_by)
  ON CONFLICT (workflow_id, user_id)
  DO UPDATE SET
    permission = EXCLUDED.permission,
    granted_by = EXCLUDED.granted_by,
    granted_at = timezone('utc', now())
  RETURNING id INTO v_permission_id;

  RETURN v_permission_id;
END;
$$;

-- Function to revoke workflow permission
CREATE OR REPLACE FUNCTION public.revoke_workflow_permission(
  p_workflow_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.workflow_permissions
  WHERE workflow_id = p_workflow_id
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Function to get user's workflow permission level
CREATE OR REPLACE FUNCTION public.get_user_workflow_permission(
  p_workflow_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission text;
BEGIN
  SELECT permission INTO v_permission
  FROM public.workflow_permissions
  WHERE workflow_id = p_workflow_id
    AND user_id = p_user_id;

  RETURN v_permission;
END;
$$;

-- ============================================================================
-- STEP 6: Update RLS policies for workflows
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can create workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete their own workflows" ON public.workflows;

-- New RLS policies with workspace context
CREATE POLICY "Users can view workflows they have permission for"
  ON public.workflows
  FOR SELECT
  USING (
    -- User owns the workflow (personal workspace)
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR
    -- User has explicit permission
    EXISTS (
      SELECT 1 FROM public.workflow_permissions wp
      WHERE wp.workflow_id = workflows.id
        AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workflows"
  ON public.workflows
  FOR INSERT
  WITH CHECK (
    -- Personal workflows: user must be the owner
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR
    -- Team/org workflows: user must be a member (implement later with workspace_members check)
    (workspace_type IN ('team', 'organization'))
  );

CREATE POLICY "Users can update workflows they can manage"
  ON public.workflows
  FOR UPDATE
  USING (
    -- User owns the workflow
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR
    -- User has manage or admin permission
    public.user_has_workflow_permission(id, auth.uid(), 'manage')
  );

CREATE POLICY "Users can delete workflows they can manage"
  ON public.workflows
  FOR DELETE
  USING (
    -- User owns the workflow
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR
    -- User has admin permission
    public.user_has_workflow_permission(id, auth.uid(), 'admin')
  );

-- ============================================================================
-- STEP 7: Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN public.workflows.workspace_type IS
  'Workspace context: personal (individual), team (team workspace), organization (org workspace)';

COMMENT ON COLUMN public.workflows.workspace_id IS
  'UUID of workspace (team/organization). NULL for personal workflows.';

COMMENT ON COLUMN public.workflows.created_by IS
  'User who created the workflow. May differ from user_id in shared workflows.';

COMMENT ON TABLE public.workflow_permissions IS
  'Granular permissions for workflow access. Permissions: use (execute), manage (edit), admin (full control).';

COMMENT ON COLUMN public.workflow_permissions.permission IS
  'Permission level: use (can execute), manage (can edit/execute), admin (full control including permissions)';
