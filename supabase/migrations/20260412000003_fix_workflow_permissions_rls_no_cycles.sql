-- Fix cyclic RLS: workflows -> workflow_permissions -> workflows
--
-- Rule: workflow_permissions policies must be SELF-CONTAINED.
-- They may only reference auth.uid() and workflow_permissions columns.
-- No subqueries into workflows or any other RLS-protected table.
--
-- Dependency direction: workflows -> workflow_permissions (one-way only).

-- 1. Drop ALL existing policies on workflow_permissions
DROP POLICY IF EXISTS "wp_select" ON public.workflow_permissions;
DROP POLICY IF EXISTS "wp_insert" ON public.workflow_permissions;
DROP POLICY IF EXISTS "wp_update" ON public.workflow_permissions;
DROP POLICY IF EXISTS "wp_delete" ON public.workflow_permissions;
DROP POLICY IF EXISTS "Users can view their own workflow permissions" ON public.workflow_permissions;
DROP POLICY IF EXISTS "Admins can manage workflow permissions" ON public.workflow_permissions;
DROP POLICY IF EXISTS "Workflow owners can manage permissions" ON public.workflow_permissions;

-- 2. Recreate with self-contained policies only

-- SELECT: user can see their own permission rows
CREATE POLICY "wp_select"
  ON public.workflow_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: only the granted_by user (set by app code) can insert
-- App layer is responsible for verifying the granter is an owner/admin
CREATE POLICY "wp_insert"
  ON public.workflow_permissions
  FOR INSERT
  WITH CHECK (granted_by = auth.uid());

-- UPDATE: only admins on this workflow can update permissions
-- Uses SECURITY DEFINER function — no RLS re-entry
CREATE POLICY "wp_update"
  ON public.workflow_permissions
  FOR UPDATE
  USING (public.is_workflow_admin(workflow_id, auth.uid()));

-- DELETE: only admins on this workflow can delete permissions
CREATE POLICY "wp_delete"
  ON public.workflow_permissions
  FOR DELETE
  USING (public.is_workflow_admin(workflow_id, auth.uid()));

NOTIFY pgrst, 'reload schema';
