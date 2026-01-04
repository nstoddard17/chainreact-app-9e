-- Normalize workflow storage: Create workflow_edges table and add columns to workflow_nodes
-- This migration sets up proper relational storage for workflow nodes and edges

-- ============================================================================
-- CREATE workflow_nodes TABLE (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  label text,
  description text,
  config jsonb DEFAULT '{}'::jsonb,
  position_x numeric DEFAULT 400,
  position_y numeric DEFAULT 100,
  is_trigger boolean DEFAULT false,
  provider_id text,
  display_order integer DEFAULT 0,
  in_ports jsonb DEFAULT '[]'::jsonb,
  out_ports jsonb DEFAULT '[]'::jsonb,
  io_schema jsonb,
  policy jsonb DEFAULT '{"timeoutMs": 60000, "retries": 0}'::jsonb,
  cost_hint numeric DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns if table already exists (for idempotency)
-- Note: ADD COLUMN IF NOT EXISTS doesn't work with inline REFERENCES, so we add column first then constraint
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS in_ports jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS out_ports jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS io_schema jsonb;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS policy jsonb DEFAULT '{"timeoutMs": 60000, "retries": 0}'::jsonb;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS cost_hint numeric DEFAULT 0;
ALTER TABLE public.workflow_nodes ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Add foreign key constraint for user_id if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.workflow_nodes
    ADD CONSTRAINT workflow_nodes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for workflow_nodes
CREATE INDEX IF NOT EXISTS workflow_nodes_workflow_id_idx ON public.workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_nodes_user_id_idx ON public.workflow_nodes(user_id);
CREATE INDEX IF NOT EXISTS workflow_nodes_node_type_idx ON public.workflow_nodes(node_type);
CREATE INDEX IF NOT EXISTS workflow_nodes_display_order_idx ON public.workflow_nodes(workflow_id, display_order);

-- ============================================================================
-- CREATE workflow_edges TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id uuid,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  source_port_id text DEFAULT 'source',
  target_port_id text DEFAULT 'target',
  condition_expr text,
  mappings jsonb DEFAULT '[]'::jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT workflow_edges_unique_connection UNIQUE (workflow_id, source_node_id, target_node_id)
);

-- Add user_id column if table already exists without it
ALTER TABLE public.workflow_edges ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add foreign key constraint for user_id if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.workflow_edges
    ADD CONSTRAINT workflow_edges_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for workflow_edges
CREATE INDEX IF NOT EXISTS workflow_edges_workflow_id_idx ON public.workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS workflow_edges_user_id_idx ON public.workflow_edges(user_id);
CREATE INDEX IF NOT EXISTS workflow_edges_source_node_idx ON public.workflow_edges(source_node_id);
CREATE INDEX IF NOT EXISTS workflow_edges_target_node_idx ON public.workflow_edges(target_node_id);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================
ALTER TABLE public.workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_edges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR workflow_nodes
-- ============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "workflow_nodes_select_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_insert_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_update_policy" ON public.workflow_nodes;
DROP POLICY IF EXISTS "workflow_nodes_delete_policy" ON public.workflow_nodes;

-- SELECT: Users can view nodes for workflows they own or have access to
CREATE POLICY "workflow_nodes_select_policy" ON public.workflow_nodes FOR SELECT
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can insert nodes for workflows they own
CREATE POLICY "workflow_nodes_insert_policy" ON public.workflow_nodes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
    )
  );

-- UPDATE: Users can update nodes for workflows they own
CREATE POLICY "workflow_nodes_update_policy" ON public.workflow_nodes FOR UPDATE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
    )
  );

-- DELETE: Users can delete nodes for workflows they own
CREATE POLICY "workflow_nodes_delete_policy" ON public.workflow_nodes FOR DELETE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- RLS POLICIES FOR workflow_edges
-- ============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "workflow_edges_select_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_insert_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_update_policy" ON public.workflow_edges;
DROP POLICY IF EXISTS "workflow_edges_delete_policy" ON public.workflow_edges;

-- SELECT: Users can view edges for workflows they own or have access to
CREATE POLICY "workflow_edges_select_policy" ON public.workflow_edges FOR SELECT
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- INSERT: Users can insert edges for workflows they own
CREATE POLICY "workflow_edges_insert_policy" ON public.workflow_edges FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
    )
  );

-- UPDATE: Users can update edges for workflows they own
CREATE POLICY "workflow_edges_update_policy" ON public.workflow_edges FOR UPDATE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
    )
  );

-- DELETE: Users can delete edges for workflows they own
CREATE POLICY "workflow_edges_delete_policy" ON public.workflow_edges FOR DELETE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT id FROM public.workflows WHERE user_id = auth.uid())
    OR workflow_id IN (
      SELECT w.id FROM public.workflows w
      JOIN public.workspace_members wm ON w.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- TRIGGER FOR updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for workflow_nodes
DROP TRIGGER IF EXISTS workflow_nodes_updated_at ON public.workflow_nodes;
CREATE TRIGGER workflow_nodes_updated_at
  BEFORE UPDATE ON public.workflow_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for workflow_edges
DROP TRIGGER IF EXISTS workflow_edges_updated_at ON public.workflow_edges;
CREATE TRIGGER workflow_edges_updated_at
  BEFORE UPDATE ON public.workflow_edges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
