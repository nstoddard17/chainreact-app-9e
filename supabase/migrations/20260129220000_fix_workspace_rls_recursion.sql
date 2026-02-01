-- Fix infinite recursion in workspace RLS policies
-- The previous policies had circular references between workspaces and workspace_memberships

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view workspace memberships" ON public.workspace_memberships;
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.workspace_memberships;

-- Create a security definer function to check workspace membership without RLS
-- This breaks the circular dependency
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID, usr_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_memberships
    WHERE workspace_id = ws_id AND user_id = usr_id
  );
$$;

-- Create a security definer function to check workspace ownership without RLS
CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws_id UUID, usr_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = ws_id AND owner_id = usr_id
  );
$$;

-- Recreate workspaces SELECT policy using the function
CREATE POLICY "Users can view their workspaces" ON public.workspaces
    FOR SELECT
    USING (
        owner_id = auth.uid()
        OR public.is_workspace_member(id, auth.uid())
    );

-- Recreate workspace_memberships SELECT policy using the function
CREATE POLICY "Users can view workspace memberships" ON public.workspace_memberships
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.is_workspace_owner(workspace_id, auth.uid())
    );

-- Recreate owners can manage memberships policy using the function
CREATE POLICY "Owners can manage memberships" ON public.workspace_memberships
    FOR ALL
    USING (
        public.is_workspace_owner(workspace_id, auth.uid())
    );

-- Grant execute on the functions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID, UUID) TO authenticated;
