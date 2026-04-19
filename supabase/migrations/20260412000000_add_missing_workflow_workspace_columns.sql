-- ============================================================================
-- Consolidated migration: Add missing workspace, folder, billing, and
-- permission columns/tables that the application code depends on.
--
-- These were planned in migrations_backup/ but never pushed to the database.
-- ============================================================================

-- ============================================================================
-- 1. workflow_folders table + default-folder RPC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workflow_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  parent_folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'folder',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY;

-- RLS
DO $$ BEGIN
  CREATE POLICY "Users can view own folders"
    ON public.workflow_folders FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own folders"
    ON public.workflow_folders FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own folders"
    ON public.workflow_folders FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own folders"
    ON public.workflow_folders FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_folders_user_id ON public.workflow_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_folders_organization_id ON public.workflow_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent_folder_id ON public.workflow_folders(parent_folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_folders_user_default
  ON public.workflow_folders(user_id) WHERE is_default = TRUE;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_workflow_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workflow_folders_updated_at ON public.workflow_folders;
CREATE TRIGGER update_workflow_folders_updated_at
  BEFORE UPDATE ON public.workflow_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_folders_updated_at();

-- Default folder RPC
CREATE OR REPLACE FUNCTION create_default_workflow_folder_for_user(user_id_param UUID, user_email TEXT)
RETURNS UUID AS $$
DECLARE
  username TEXT;
  folder_id UUID;
BEGIN
  username := SPLIT_PART(user_email, '@', 1);

  SELECT id INTO folder_id
  FROM public.workflow_folders
  WHERE user_id = user_id_param AND is_default = TRUE
  LIMIT 1;

  IF folder_id IS NULL THEN
    INSERT INTO public.workflow_folders (
      user_id, name, description, color, icon, is_default, parent_folder_id
    ) VALUES (
      user_id_param,
      username || '''s Workflows',
      'Your default workflow folder',
      '#3B82F6', 'folder', TRUE, NULL
    )
    RETURNING id INTO folder_id;
  END IF;

  RETURN folder_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Add missing columns to workflows table
-- ============================================================================

-- folder_id
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.workflow_folders(id) ON DELETE SET NULL;

-- workspace_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workflows' AND column_name = 'workspace_type'
  ) THEN
    ALTER TABLE public.workflows ADD COLUMN workspace_type TEXT DEFAULT 'personal';
    ALTER TABLE public.workflows ADD CONSTRAINT workflows_workspace_type_check
      CHECK (workspace_type IN ('personal', 'team', 'organization'));
  END IF;
END $$;

-- workspace_id
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- last_modified_by
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- billing_scope_type
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS billing_scope_type TEXT DEFAULT 'user';

-- billing_scope_id (UUID in production — matches user_id/team_id/org_id)
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS billing_scope_id UUID;

-- Convert created_by from TEXT to UUID if it is not already UUID
DO $$
DECLARE
  col_udt TEXT;
BEGIN
  SELECT udt_name INTO col_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'workflows' AND column_name = 'created_by';

  IF col_udt IS NOT NULL AND col_udt <> 'uuid' THEN
    ALTER TABLE public.workflows ALTER COLUMN created_by DROP DEFAULT;
    ALTER TABLE public.workflows ALTER COLUMN created_by TYPE UUID USING
      CASE WHEN created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN created_by::UUID
           ELSE NULL
      END;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS workflows_workspace_type_idx ON public.workflows(workspace_type);
CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx ON public.workflows(workspace_id);
CREATE INDEX IF NOT EXISTS workflows_created_by_idx ON public.workflows(created_by);
CREATE INDEX IF NOT EXISTS workflows_workspace_context_idx ON public.workflows(workspace_type, workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_folder_id ON public.workflows(folder_id);
CREATE INDEX IF NOT EXISTS idx_workflows_last_modified_by ON public.workflows(last_modified_by);

-- Backfill in separate statements to avoid cross-column type issues
UPDATE public.workflows SET workspace_type = 'personal' WHERE workspace_type IS NULL;
UPDATE public.workflows SET last_modified_by = user_id WHERE last_modified_by IS NULL;
UPDATE public.workflows SET billing_scope_type = 'user' WHERE billing_scope_type IS NULL;
UPDATE public.workflows SET billing_scope_id = user_id WHERE billing_scope_id IS NULL;
UPDATE public.workflows SET created_by = user_id WHERE created_by IS NULL;

-- ============================================================================
-- 3. workflow_permissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workflow_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('use', 'manage', 'admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (workflow_id, user_id)
);

ALTER TABLE public.workflow_permissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS workflow_permissions_workflow_id_idx ON public.workflow_permissions(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_permissions_user_id_idx ON public.workflow_permissions(user_id);
CREATE INDEX IF NOT EXISTS workflow_permissions_lookup_idx ON public.workflow_permissions(workflow_id, user_id);

-- RLS for workflow_permissions
DO $$ BEGIN
  CREATE POLICY "Users can view their own workflow permissions"
    ON public.workflow_permissions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can manage workflow permissions"
    ON public.workflow_permissions FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.workflow_permissions wp
        WHERE wp.workflow_id = workflow_permissions.workflow_id
          AND wp.user_id = auth.uid()
          AND wp.permission = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant admin permission to existing workflow owners (if not already granted)
INSERT INTO public.workflow_permissions (workflow_id, user_id, permission, granted_by)
SELECT w.id, w.user_id, 'admin', w.user_id
FROM public.workflows w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_permissions wp
  WHERE wp.workflow_id = w.id AND wp.user_id = w.user_id
)
ON CONFLICT (workflow_id, user_id) DO NOTHING;

-- ============================================================================
-- 4. Helper functions for permission management
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_has_workflow_permission(
  p_workflow_id UUID, p_user_id UUID, p_required_permission TEXT DEFAULT 'use'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_permission TEXT;
  v_permission_level INT;
  v_required_level INT;
BEGIN
  v_required_level := CASE p_required_permission
    WHEN 'admin' THEN 3 WHEN 'manage' THEN 2 WHEN 'use' THEN 1 ELSE 0 END;

  SELECT permission INTO v_permission
  FROM public.workflow_permissions
  WHERE workflow_id = p_workflow_id AND user_id = p_user_id;

  IF v_permission IS NULL THEN RETURN FALSE; END IF;

  v_permission_level := CASE v_permission
    WHEN 'admin' THEN 3 WHEN 'manage' THEN 2 WHEN 'use' THEN 1 ELSE 0 END;

  RETURN v_permission_level >= v_required_level;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_workflow_permission(
  p_workflow_id UUID, p_user_id UUID, p_permission TEXT, p_granted_by UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_permission_id UUID;
BEGIN
  INSERT INTO public.workflow_permissions (workflow_id, user_id, permission, granted_by)
  VALUES (p_workflow_id, p_user_id, p_permission, p_granted_by)
  ON CONFLICT (workflow_id, user_id)
  DO UPDATE SET permission = EXCLUDED.permission, granted_by = EXCLUDED.granted_by,
    granted_at = timezone('utc', now())
  RETURNING id INTO v_permission_id;
  RETURN v_permission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_workflow_permission(p_workflow_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.workflow_permissions
  WHERE workflow_id = p_workflow_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 5. Update RLS policies on workflows to support workspace context
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can create workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can view workflows they have permission for" ON public.workflows;
DROP POLICY IF EXISTS "Users can update workflows they can manage" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete workflows they can manage" ON public.workflows;

CREATE POLICY "Users can view workflows they have permission for"
  ON public.workflows FOR SELECT
  USING (
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.workflow_permissions wp
      WHERE wp.workflow_id = workflows.id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workflows"
  ON public.workflows FOR INSERT
  WITH CHECK (
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR (workspace_type IN ('team', 'organization'))
  );

CREATE POLICY "Users can update workflows they can manage"
  ON public.workflows FOR UPDATE
  USING (
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR public.user_has_workflow_permission(id, auth.uid(), 'manage')
  );

CREATE POLICY "Users can delete workflows they can manage"
  ON public.workflows FOR DELETE
  USING (
    (workspace_type = 'personal' AND user_id = auth.uid())
    OR public.user_has_workflow_permission(id, auth.uid(), 'admin')
  );

-- Comments
COMMENT ON COLUMN public.workflows.workspace_type IS 'Workspace context: personal, team, or organization';
COMMENT ON COLUMN public.workflows.workspace_id IS 'UUID of workspace (team/org). NULL for personal workflows.';
COMMENT ON COLUMN public.workflows.billing_scope_type IS 'Billing scope: user, team, or organization';
COMMENT ON COLUMN public.workflows.billing_scope_id IS 'ID of the billing entity (user_id, team_id, or org_id)';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
