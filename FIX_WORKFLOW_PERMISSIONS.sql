-- =====================================================
-- CREATE WORKFLOW_PERMISSIONS TABLE
-- =====================================================
-- The workflows page is stuck loading because this
-- table is missing and referenced in the query
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.workflow_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view',
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, user_id),
  CHECK (permission IN ('view', 'edit', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_permissions_workflow_id ON public.workflow_permissions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_permissions_user_id ON public.workflow_permissions(user_id);

ALTER TABLE public.workflow_permissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own permissions
DROP POLICY IF EXISTS "Users can view own permissions" ON public.workflow_permissions;
CREATE POLICY "Users can view own permissions"
  ON public.workflow_permissions FOR SELECT
  USING (user_id = auth.uid());

-- Workflow owners can manage permissions
DROP POLICY IF EXISTS "Workflow owners can manage permissions" ON public.workflow_permissions;
CREATE POLICY "Workflow owners can manage permissions"
  ON public.workflow_permissions FOR ALL
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM public.workflows WHERE user_id = auth.uid()
    )
  );

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run this to verify:
-- SELECT * FROM public.workflow_permissions LIMIT 1;
-- =====================================================
