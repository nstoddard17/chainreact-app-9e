-- Restore workspace tables that were incorrectly dropped in 20260128044221
-- These tables are actively used by the application

-- 1. Create workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Personal Workspace',
    slug TEXT,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for owner lookup
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);

-- 2. Create workspace_memberships table
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'owner')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id ON public.workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_id ON public.workspace_memberships(workspace_id);

-- 3. Enable RLS on both tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for workspaces
-- Users can view workspaces they own or are members of
DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
CREATE POLICY "Users can view their workspaces" ON public.workspaces
    FOR SELECT
    USING (
        owner_id = auth.uid()
        OR id IN (
            SELECT workspace_id FROM public.workspace_memberships
            WHERE user_id = auth.uid()
        )
    );

-- Users can create their own workspaces
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
CREATE POLICY "Users can create workspaces" ON public.workspaces
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- Only owners can update their workspaces
DROP POLICY IF EXISTS "Owners can update workspaces" ON public.workspaces;
CREATE POLICY "Owners can update workspaces" ON public.workspaces
    FOR UPDATE
    USING (owner_id = auth.uid());

-- Only owners can delete their workspaces
DROP POLICY IF EXISTS "Owners can delete workspaces" ON public.workspaces;
CREATE POLICY "Owners can delete workspaces" ON public.workspaces
    FOR DELETE
    USING (owner_id = auth.uid());

-- 5. RLS policies for workspace_memberships
-- Users can view memberships for workspaces they belong to
DROP POLICY IF EXISTS "Users can view workspace memberships" ON public.workspace_memberships;
CREATE POLICY "Users can view workspace memberships" ON public.workspace_memberships
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR workspace_id IN (
            SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
        )
    );

-- Workspace owners can manage memberships
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.workspace_memberships;
CREATE POLICY "Owners can manage memberships" ON public.workspace_memberships
    FOR ALL
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
        )
    );

-- Users can insert their own membership (for joining workspaces)
DROP POLICY IF EXISTS "Users can create own membership" ON public.workspace_memberships;
CREATE POLICY "Users can create own membership" ON public.workspace_memberships
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
