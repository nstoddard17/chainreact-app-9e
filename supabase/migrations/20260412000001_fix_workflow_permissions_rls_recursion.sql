-- Fix infinite recursion in workflow_permissions RLS policy.
-- The "Admins can manage" policy queries workflow_permissions itself,
-- which triggers the same policy check, causing infinite recursion.
--
-- Fix: Use a SECURITY DEFINER function that bypasses RLS to check admin status.

-- 1. Create a helper function that bypasses RLS to check admin permission
CREATE OR REPLACE FUNCTION public.is_workflow_admin(p_workflow_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workflow_permissions
    WHERE workflow_id = p_workflow_id
      AND user_id = p_user_id
      AND permission = 'admin'
  );
$$;

-- 2. Drop the recursive policy
DROP POLICY IF EXISTS "Admins can manage workflow permissions" ON public.workflow_permissions;

-- 3. Recreate it using the SECURITY DEFINER function
CREATE POLICY "Admins can manage workflow permissions"
  ON public.workflow_permissions
  FOR ALL
  USING (
    public.is_workflow_admin(workflow_id, auth.uid())
  );

-- Also allow workflow owners to manage permissions (via workflows table, no recursion)
DROP POLICY IF EXISTS "Workflow owners can manage permissions" ON public.workflow_permissions;
CREATE POLICY "Workflow owners can manage permissions"
  ON public.workflow_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_permissions.workflow_id
        AND w.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
