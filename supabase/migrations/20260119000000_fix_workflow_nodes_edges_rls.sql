-- Fix infinite recursion in RLS policies for workflow_nodes and workflow_edges
-- The issue: policies reference workspace_members which has its own RLS, creating a loop
-- Solution: Use SECURITY DEFINER functions to check membership without triggering RLS

-- ============================================================================
-- CREATE SECURITY DEFINER FUNCTION TO CHECK WORKSPACE ACCESS
-- ============================================================================

-- Function to check if a user has access to a workflow's workspace
CREATE OR REPLACE FUNCTION public.user_has_workflow_access(p_workflow_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    -- User owns the workflow directly
    SELECT 1 FROM public.workflows 
    WHERE id = p_workflow_id AND user_id = p_user_id
  )
  OR EXISTS (
    -- User is a member of the workflow's workspace
    SELECT 1 FROM public.workflows w
    JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
    WHERE w.id = p_workflow_id AND wm.user_id = p_user_id
  );
$$;

-- Function to check if user can edit a workflow
CREATE OR REPLACE FUNCTION public.user_can_edit_workflow(p_workflow_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    -- User owns the workflow directly
    SELECT 1 FROM public.workflows 
    WHERE id = p_workflow_id AND user_id = p_user_id
  )
  OR EXISTS (
    -- User is an editor/admin/owner in the workflow's workspace
    SELECT 1 FROM public.workflows w
    JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
    WHERE w.id = p_workflow_id 
      AND wm.user_id = p_user_id 
      AND wm.role IN ('owner', 'admin', 'editor')
  );
$$;

-- ============================================================================
-- RECREATE RLS POLICIES FOR workflow_nodes
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "workflow_nodes_select_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_insert_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_update_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_delete_policy" ON public.workflow_nodes;

-- SELECT: Users can view nodes for workflows they have access to
CREATE POLICY "workflow_nodes_select_policy" ON public.workflow_nodes FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.user_has_workflow_access(workflow_id, auth.uid())
  );

-- INSERT: Users can insert nodes for workflows they can edit
CREATE POLICY "workflow_nodes_insert_policy" ON public.workflow_nodes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.user_can_edit_workflow(workflow_id, auth.uid())
  );

-- UPDATE: Users can update nodes for workflows they can edit
CREATE POLICY "workflow_nodes_update_policy" ON public.workflow_nodes FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.user_can_edit_workflow(workflow_id, auth.uid())
  );

-- DELETE: Users can delete nodes for workflows they own or have admin access to
CREATE POLICY "workflow_nodes_delete_policy" ON public.workflow_nodes FOR DELETE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE w.id = workflow_id 
        AND wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- RECREATE RLS POLICIES FOR workflow_edges
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "workflow_edges_select_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_insert_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_update_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_delete_policy" ON public.workflow_edges;

-- SELECT: Users can view edges for workflows they have access to
CREATE POLICY "workflow_edges_select_policy" ON public.workflow_edges FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.user_has_workflow_access(workflow_id, auth.uid())
  );

-- INSERT: Users can insert edges for workflows they can edit
CREATE POLICY "workflow_edges_insert_policy" ON public.workflow_edges FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.user_can_edit_workflow(workflow_id, auth.uid())
  );

-- UPDATE: Users can update edges for workflows they can edit
CREATE POLICY "workflow_edges_update_policy" ON public.workflow_edges FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.user_can_edit_workflow(workflow_id, auth.uid())
  );

-- DELETE: Users can delete edges for workflows they own or have admin access to
CREATE POLICY "workflow_edges_delete_policy" ON public.workflow_edges FOR DELETE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE w.id = workflow_id 
        AND wm.user_id = auth.uid() 
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.user_has_workflow_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_edit_workflow TO authenticated;
