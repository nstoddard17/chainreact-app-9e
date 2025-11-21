-- =====================================================
-- COMPREHENSIVE TABLE RENAMING AND CLEANUP MIGRATION
-- =====================================================
-- This script:
-- 1. Renames all flow_v2_* tables to workflows_* (clean naming)
-- 2. Drops all legacy workflow tables
-- 3. Updates all foreign key constraints, indexes, and triggers
-- 4. Preserves all data and relationships
-- =====================================================

-- IMPORTANT: Run this script during a maintenance window
-- Estimated time: 2-5 minutes depending on data volume

BEGIN;

-- =====================================================
-- STEP 1: DROP ALL LEGACY TABLES
-- =====================================================
-- These tables are no longer used in V2 architecture

-- Drop legacy workflow execution table
DROP TABLE IF EXISTS public.workflow_executions CASCADE;

-- Drop legacy workflows table (the main old table)
DROP TABLE IF EXISTS public.workflows CASCADE;

-- NOTE: DO NOT drop workflow_permissions - we'll keep and update it
-- DROP TABLE IF EXISTS public.workflow_permissions CASCADE;

-- Drop legacy loop executions if it references old tables
-- Note: Keep this if it's actually used with V2, otherwise drop
-- DROP TABLE IF EXISTS public.loop_executions CASCADE;

-- =====================================================
-- STEP 2: RENAME FLOW_V2 TABLES TO WORKFLOWS
-- =====================================================

-- Rename main definitions table
ALTER TABLE IF EXISTS public.flow_v2_definitions
  RENAME TO workflows;

-- Rename revisions table
ALTER TABLE IF EXISTS public.flow_v2_revisions
  RENAME TO workflows_revisions;

-- Rename runs table
ALTER TABLE IF EXISTS public.flow_v2_runs
  RENAME TO workflows_runs;

-- Rename run nodes table
ALTER TABLE IF EXISTS public.flow_v2_run_nodes
  RENAME TO workflows_run_nodes;

-- Rename lineage table
ALTER TABLE IF EXISTS public.flow_v2_lineage
  RENAME TO workflows_lineage;

-- Rename templates table
ALTER TABLE IF EXISTS public.flow_v2_templates
  RENAME TO workflows_templates;

-- Rename schedules table
ALTER TABLE IF EXISTS public.flow_v2_schedules
  RENAME TO workflows_schedules;

-- Rename published revisions table
ALTER TABLE IF EXISTS public.flow_v2_published_revisions
  RENAME TO workflows_published_revisions;

-- Rename node logs table
ALTER TABLE IF EXISTS public.flow_v2_node_logs
  RENAME TO workflows_node_logs;

-- =====================================================
-- STEP 3: RENAME ALL INDEXES
-- =====================================================

-- Workflows (main table) indexes
ALTER INDEX IF EXISTS flow_v2_definitions_pkey
  RENAME TO workflows_pkey;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_folder_id
  RENAME TO idx_workflows_folder_id;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_owner_id
  RENAME TO idx_workflows_owner_id;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_workspace_id
  RENAME TO idx_workflows_workspace_id;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_organization_id
  RENAME TO idx_workflows_organization_id;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_is_active
  RENAME TO idx_workflows_is_active;
ALTER INDEX IF EXISTS idx_flow_v2_definitions_status
  RENAME TO idx_workflows_status;

-- Workflows revisions indexes
ALTER INDEX IF EXISTS flow_v2_revisions_pkey
  RENAME TO workflows_revisions_pkey;
ALTER INDEX IF EXISTS flow_v2_revisions_flow_id_idx
  RENAME TO workflows_revisions_workflow_id_idx;
ALTER INDEX IF EXISTS flow_v2_revisions_flow_id_version_idx
  RENAME TO workflows_revisions_workflow_id_version_idx;
ALTER INDEX IF EXISTS flow_v2_revisions_unique_version
  RENAME TO workflows_revisions_unique_version;

-- Workflows runs indexes
ALTER INDEX IF EXISTS flow_v2_runs_pkey
  RENAME TO workflows_runs_pkey;
ALTER INDEX IF EXISTS flow_v2_runs_flow_id_idx
  RENAME TO workflows_runs_workflow_id_idx;
ALTER INDEX IF EXISTS flow_v2_runs_revision_id_idx
  RENAME TO workflows_runs_revision_id_idx;
ALTER INDEX IF EXISTS flow_v2_runs_status_idx
  RENAME TO workflows_runs_status_idx;

-- Workflows run nodes indexes
ALTER INDEX IF EXISTS flow_v2_run_nodes_pkey
  RENAME TO workflows_run_nodes_pkey;
ALTER INDEX IF EXISTS flow_v2_run_nodes_run_id_idx
  RENAME TO workflows_run_nodes_run_id_idx;
ALTER INDEX IF EXISTS flow_v2_run_nodes_run_id_node_id_idx
  RENAME TO workflows_run_nodes_run_id_node_id_idx;

-- Workflows lineage indexes
ALTER INDEX IF EXISTS flow_v2_lineage_pkey
  RENAME TO workflows_lineage_pkey;
ALTER INDEX IF EXISTS flow_v2_lineage_run_id_idx
  RENAME TO workflows_lineage_run_id_idx;
ALTER INDEX IF EXISTS flow_v2_lineage_target_idx
  RENAME TO workflows_lineage_target_idx;

-- Workflows templates indexes
ALTER INDEX IF EXISTS flow_v2_templates_pkey
  RENAME TO workflows_templates_pkey;

-- Workflows schedules indexes
ALTER INDEX IF EXISTS flow_v2_schedules_pkey
  RENAME TO workflows_schedules_pkey;

-- Workflows published revisions indexes
ALTER INDEX IF EXISTS flow_v2_published_revisions_pkey
  RENAME TO workflows_published_revisions_pkey;

-- Workflows node logs indexes
ALTER INDEX IF EXISTS flow_v2_node_logs_pkey
  RENAME TO workflows_node_logs_pkey;

-- =====================================================
-- STEP 4: RENAME COLUMN REFERENCES
-- =====================================================

-- Rename flow_id to workflow_id in all related tables
ALTER TABLE IF EXISTS public.workflows_revisions
  RENAME COLUMN flow_id TO workflow_id;

ALTER TABLE IF EXISTS public.workflows_runs
  RENAME COLUMN flow_id TO workflow_id;

ALTER TABLE IF EXISTS public.workflows_templates
  RENAME COLUMN flow_id TO workflow_id;

ALTER TABLE IF EXISTS public.workflows_schedules
  RENAME COLUMN flow_id TO workflow_id;

ALTER TABLE IF EXISTS public.workflows_published_revisions
  RENAME COLUMN flow_id TO workflow_id;

-- =====================================================
-- STEP 5: RENAME CONSTRAINTS
-- =====================================================
-- Note: Using DO blocks with exception handling to safely rename constraints

-- Workflows revisions constraints
DO $$
BEGIN
  -- Rename foreign key constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_v2_revisions_flow_id_fkey'
  ) THEN
    ALTER TABLE public.workflows_revisions
      RENAME CONSTRAINT flow_v2_revisions_flow_id_fkey
      TO workflows_revisions_workflow_id_fkey;
  END IF;

  -- Rename unique constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_v2_revisions_unique_version'
  ) THEN
    ALTER TABLE public.workflows_revisions
      RENAME CONSTRAINT flow_v2_revisions_unique_version
      TO workflows_revisions_unique_version;
  END IF;
END $$;

-- Workflows runs constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_runs_flow_id_fkey') THEN
    ALTER TABLE public.workflows_runs RENAME CONSTRAINT flow_v2_runs_flow_id_fkey TO workflows_runs_workflow_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_runs_revision_id_fkey') THEN
    ALTER TABLE public.workflows_runs RENAME CONSTRAINT flow_v2_runs_revision_id_fkey TO workflows_runs_revision_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_runs_status_check') THEN
    ALTER TABLE public.workflows_runs RENAME CONSTRAINT flow_v2_runs_status_check TO workflows_runs_status_check;
  END IF;
END $$;

-- Workflows run nodes constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_run_nodes_run_id_fkey') THEN
    ALTER TABLE public.workflows_run_nodes RENAME CONSTRAINT flow_v2_run_nodes_run_id_fkey TO workflows_run_nodes_run_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_run_nodes_status_check') THEN
    ALTER TABLE public.workflows_run_nodes RENAME CONSTRAINT flow_v2_run_nodes_status_check TO workflows_run_nodes_status_check;
  END IF;
END $$;

-- Workflows lineage constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_lineage_run_id_fkey') THEN
    ALTER TABLE public.workflows_lineage RENAME CONSTRAINT flow_v2_lineage_run_id_fkey TO workflows_lineage_run_id_fkey;
  END IF;
END $$;

-- Workflows templates constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_templates_flow_id_fkey') THEN
    ALTER TABLE public.workflows_templates RENAME CONSTRAINT flow_v2_templates_flow_id_fkey TO workflows_templates_workflow_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_templates_revision_id_fkey') THEN
    ALTER TABLE public.workflows_templates RENAME CONSTRAINT flow_v2_templates_revision_id_fkey TO workflows_templates_revision_id_fkey;
  END IF;
END $$;

-- Workflows schedules constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_schedules_flow_id_fkey') THEN
    ALTER TABLE public.workflows_schedules RENAME CONSTRAINT flow_v2_schedules_flow_id_fkey TO workflows_schedules_workflow_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_schedules_revision_id_fkey') THEN
    ALTER TABLE public.workflows_schedules RENAME CONSTRAINT flow_v2_schedules_revision_id_fkey TO workflows_schedules_revision_id_fkey;
  END IF;
END $$;

-- Workflows published revisions constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_published_revisions_flow_id_fkey') THEN
    ALTER TABLE public.workflows_published_revisions RENAME CONSTRAINT flow_v2_published_revisions_flow_id_fkey TO workflows_published_revisions_workflow_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_published_revisions_revision_id_fkey') THEN
    ALTER TABLE public.workflows_published_revisions RENAME CONSTRAINT flow_v2_published_revisions_revision_id_fkey TO workflows_published_revisions_revision_id_fkey;
  END IF;
END $$;

-- Workflows node logs constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_v2_node_logs_run_id_fkey') THEN
    ALTER TABLE public.workflows_node_logs RENAME CONSTRAINT flow_v2_node_logs_run_id_fkey TO workflows_node_logs_run_id_fkey;
  END IF;
END $$;

-- =====================================================
-- STEP 6: UPDATE TRIGGERS AND FUNCTIONS
-- =====================================================

-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS update_flow_v2_definitions_updated_at ON public.workflows;

-- Create or replace the function for updating updated_at
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old function if it exists (different name)
DROP FUNCTION IF EXISTS update_flow_v2_definitions_updated_at() CASCADE;

-- Create the trigger using the new function
DROP TRIGGER IF EXISTS update_workflows_updated_at ON public.workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflows_updated_at();

-- =====================================================
-- STEP 7: UPDATE/CREATE WORKFLOW_PERMISSIONS TABLE
-- =====================================================

-- Create or update workflow_permissions table for per-workflow sharing
CREATE TABLE IF NOT EXISTS public.workflow_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, user_id)
);

-- Create indexes for workflow_permissions
CREATE INDEX IF NOT EXISTS idx_workflow_permissions_workflow_id
  ON public.workflow_permissions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_permissions_user_id
  ON public.workflow_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_permissions_permission
  ON public.workflow_permissions(permission);

-- Enable RLS on workflow_permissions
ALTER TABLE public.workflow_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_permissions
-- Users can view permissions for workflows they own or have access to
DROP POLICY IF EXISTS "users_can_view_permissions_for_accessible_workflows" ON public.workflow_permissions;
CREATE POLICY "users_can_view_permissions_for_accessible_workflows"
  ON public.workflow_permissions FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE owner_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Users can insert permissions for workflows they own
DROP POLICY IF EXISTS "users_can_grant_permissions_for_owned_workflows" ON public.workflow_permissions;
CREATE POLICY "users_can_grant_permissions_for_owned_workflows"
  ON public.workflow_permissions FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE owner_id = auth.uid()
    )
  );

-- Users can update permissions for workflows they own
DROP POLICY IF EXISTS "users_can_update_permissions_for_owned_workflows" ON public.workflow_permissions;
CREATE POLICY "users_can_update_permissions_for_owned_workflows"
  ON public.workflow_permissions FOR UPDATE
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE owner_id = auth.uid()
    )
  );

-- Users can delete permissions for workflows they own
DROP POLICY IF EXISTS "users_can_delete_permissions_for_owned_workflows" ON public.workflow_permissions;
CREATE POLICY "users_can_delete_permissions_for_owned_workflows"
  ON public.workflow_permissions FOR DELETE
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE owner_id = auth.uid()
    )
  );

-- Service role can manage all permissions
DROP POLICY IF EXISTS "service_role_can_manage_all_permissions" ON public.workflow_permissions;
CREATE POLICY "service_role_can_manage_all_permissions"
  ON public.workflow_permissions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- STEP 8: UPDATE RLS POLICIES FOR WORKFLOWS TABLE
-- =====================================================

-- Note: RLS policies reference tables by name, so they automatically
-- work with the renamed tables. However, if any policy names reference
-- the old table names, they should be updated for clarity.

-- Drop old policies if they exist (both old and new names)
DROP POLICY IF EXISTS "Users can view workflows in their folders" ON public.workflows;
DROP POLICY IF EXISTS "users_can_view_workflows_in_folders" ON public.workflows;

-- Only recreate policy if folder_id column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'workflows'
    AND column_name = 'folder_id'
  ) THEN
    EXECUTE 'CREATE POLICY "users_can_view_workflows_in_folders"
      ON public.workflows FOR SELECT
      USING (
        folder_id IN (
          SELECT id FROM public.workflow_folders
          WHERE user_id = auth.uid()
        )
      )';
  END IF;
END $$;

-- Add policy to allow users to view workflows shared with them
DROP POLICY IF EXISTS "users_can_view_shared_workflows" ON public.workflows;
CREATE POLICY "users_can_view_shared_workflows"
  ON public.workflows FOR SELECT
  USING (
    id IN (
      SELECT workflow_id FROM public.workflow_permissions
      WHERE user_id = auth.uid()
    )
  );

-- Add policy to allow users to edit workflows shared with edit/admin permission
DROP POLICY IF EXISTS "users_can_edit_shared_workflows" ON public.workflows;
CREATE POLICY "users_can_edit_shared_workflows"
  ON public.workflows FOR UPDATE
  USING (
    id IN (
      SELECT workflow_id FROM public.workflow_permissions
      WHERE user_id = auth.uid()
      AND permission IN ('edit', 'admin')
    )
  );

-- =====================================================
-- STEP 9: UPDATE LOOP EXECUTIONS TABLE
-- =====================================================
-- If loop_executions references workflow_execution_sessions (legacy),
-- we need to either drop it or update it to reference workflows_runs

-- Option A: Update to reference workflows_runs instead
-- ALTER TABLE IF EXISTS public.loop_executions
--   DROP CONSTRAINT IF EXISTS loop_executions_session_id_fkey CASCADE;

-- ALTER TABLE IF EXISTS public.loop_executions
--   ADD CONSTRAINT loop_executions_run_id_fkey
--   FOREIGN KEY (session_id) REFERENCES public.workflows_runs(id) ON DELETE CASCADE;

-- Option B: If loop_executions is not being used, drop it
-- DROP TABLE IF EXISTS public.loop_executions CASCADE;

-- =====================================================
-- STEP 10: VERIFICATION QUERIES
-- =====================================================
-- Run these after the migration to verify success

-- List all tables with 'workflow' in the name
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename LIKE '%workflow%'
-- ORDER BY tablename;

-- Verify no flow_v2 tables remain
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename LIKE '%flow_v2%';

-- Check foreign key relationships
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND tc.table_name LIKE '%workflow%'
-- ORDER BY tc.table_name;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
-- After running this migration, you'll need to update your application code:
--
-- 1. Update API endpoints:
--    - Change "flow_v2_definitions" to "workflows"
--    - Change "flow_v2_runs" to "workflows_runs"
--    - Change "flow_v2_run_nodes" to "workflows_run_nodes"
--    - Change "flow_v2_revisions" to "workflows_revisions"
--    - Change "flow_id" to "workflow_id" in queries
--
-- 2. Update TypeScript types/interfaces:
--    - Rename Flow -> Workflow (or keep Flow as alias)
--    - Update field names (flow_id -> workflow_id)
--
-- 3. Update queries in:
--    - /app/workflows/v2/api/flows/* endpoints
--    - /src/lib/workflows/builder/* files
--    - Any components that query these tables directly
--
-- 4. Search and replace across codebase:
--    - "flow_v2_definitions" -> "workflows"
--    - "flow_v2_runs" -> "workflows_runs"
--    - "flow_v2_run_nodes" -> "workflows_run_nodes"
--    - "flow_v2_revisions" -> "workflows_revisions"
--    - "flow_id" -> "workflow_id"
--
-- 5. Test thoroughly:
--    - Workflow creation
--    - Workflow execution
--    - Results display
--    - Version history
--    - Folders and organization features
--    - Workflow sharing (workflow_permissions)
--
-- =====================================================
-- WORKFLOW SHARING WITH WORKFLOW_PERMISSIONS
-- =====================================================
--
-- The workflow_permissions table enables per-workflow sharing:
--
-- Permission Levels:
--   - 'view': Can see and run the workflow
--   - 'edit': Can modify the workflow
--   - 'admin': Can modify workflow AND manage sharing
--
-- Usage Example (Share workflow with a user):
--   INSERT INTO public.workflow_permissions (workflow_id, user_id, permission, granted_by)
--   VALUES (
--     'workflow-uuid',
--     'user-uuid',
--     'edit',
--     auth.uid()
--   );
--
-- Query workflows shared with current user:
--   SELECT w.* FROM public.workflows w
--   INNER JOIN public.workflow_permissions wp ON w.id = wp.workflow_id
--   WHERE wp.user_id = auth.uid();
--
-- Query who has access to a workflow:
--   SELECT u.email, wp.permission, wp.granted_at
--   FROM public.workflow_permissions wp
--   JOIN auth.users u ON wp.user_id = u.id
--   WHERE wp.workflow_id = 'workflow-uuid';
--
-- The RLS policies ensure:
--   - Users can only see permissions for workflows they own or have access to
--   - Only workflow owners can grant/revoke permissions
--   - Users automatically see workflows shared with them
-- =====================================================
