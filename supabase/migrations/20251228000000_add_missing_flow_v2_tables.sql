-- Add missing flow_v2 tables for AI workflow builder
-- These tables were originally in migrations_backup but never applied

-- Flow V2 Revisions table
CREATE TABLE IF NOT EXISTS public.flow_v2_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flow_v2_definitions(id) ON DELETE CASCADE,
  version int NOT NULL,
  graph jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT flow_v2_revisions_unique_version UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS flow_v2_revisions_flow_id_idx ON public.flow_v2_revisions(flow_id);
CREATE INDEX IF NOT EXISTS flow_v2_revisions_flow_id_version_idx ON public.flow_v2_revisions(flow_id, version DESC);

-- Enable RLS on flow_v2_revisions
ALTER TABLE public.flow_v2_revisions ENABLE ROW LEVEL SECURITY;

-- RLS policies for flow_v2_revisions
DO $$ BEGIN
  CREATE POLICY "flow_v2_revisions_select_policy" ON public.flow_v2_revisions FOR SELECT
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_revisions_insert_policy" ON public.flow_v2_revisions FOR INSERT
    WITH CHECK (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_revisions_update_policy" ON public.flow_v2_revisions FOR UPDATE
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_revisions_delete_policy" ON public.flow_v2_revisions FOR DELETE
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Flow V2 Runs table
CREATE TABLE IF NOT EXISTS public.flow_v2_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flow_v2_definitions(id) ON DELETE CASCADE,
  revision_id uuid REFERENCES public.flow_v2_revisions(id) ON DELETE RESTRICT,
  status text NOT NULL,
  inputs jsonb,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  finished_at timestamptz,
  metadata jsonb,
  CONSTRAINT flow_v2_runs_status_check CHECK (status IN ('pending','running','success','error','cancelled'))
);

CREATE INDEX IF NOT EXISTS flow_v2_runs_flow_id_idx ON public.flow_v2_runs(flow_id);
CREATE INDEX IF NOT EXISTS flow_v2_runs_revision_id_idx ON public.flow_v2_runs(revision_id);
CREATE INDEX IF NOT EXISTS flow_v2_runs_status_idx ON public.flow_v2_runs(status);
CREATE INDEX IF NOT EXISTS flow_v2_runs_finished_at_idx ON public.flow_v2_runs(finished_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS flow_v2_runs_started_at_idx ON public.flow_v2_runs(started_at DESC);

-- Enable RLS on flow_v2_runs
ALTER TABLE public.flow_v2_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for flow_v2_runs
DO $$ BEGIN
  CREATE POLICY "flow_v2_runs_select_policy" ON public.flow_v2_runs FOR SELECT
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_runs_insert_policy" ON public.flow_v2_runs FOR INSERT
    WITH CHECK (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_runs_update_policy" ON public.flow_v2_runs FOR UPDATE
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_runs_delete_policy" ON public.flow_v2_runs FOR DELETE
    USING (
      flow_id IN (SELECT id FROM public.flow_v2_definitions WHERE owner_id = auth.uid())
      OR flow_id IN (
        SELECT fd.id FROM public.flow_v2_definitions fd
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Flow V2 Run Nodes table
CREATE TABLE IF NOT EXISTS public.flow_v2_run_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.flow_v2_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  status text NOT NULL,
  input jsonb,
  output jsonb,
  error jsonb,
  attempts int NOT NULL DEFAULT 0,
  duration_ms int,
  cost numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT flow_v2_run_nodes_status_check CHECK (status IN ('pending','running','success','error','skipped'))
);

CREATE INDEX IF NOT EXISTS flow_v2_run_nodes_run_id_idx ON public.flow_v2_run_nodes(run_id);
CREATE INDEX IF NOT EXISTS flow_v2_run_nodes_run_id_node_id_idx ON public.flow_v2_run_nodes(run_id, node_id);

-- Enable RLS on flow_v2_run_nodes
ALTER TABLE public.flow_v2_run_nodes ENABLE ROW LEVEL SECURITY;

-- RLS policies for flow_v2_run_nodes (inherit from run access)
DO $$ BEGIN
  CREATE POLICY "flow_v2_run_nodes_select_policy" ON public.flow_v2_run_nodes FOR SELECT
    USING (
      run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        WHERE fd.owner_id = auth.uid()
      )
      OR run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_run_nodes_insert_policy" ON public.flow_v2_run_nodes FOR INSERT
    WITH CHECK (
      run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        WHERE fd.owner_id = auth.uid()
      )
      OR run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_run_nodes_update_policy" ON public.flow_v2_run_nodes FOR UPDATE
    USING (
      run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        WHERE fd.owner_id = auth.uid()
      )
      OR run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Flow V2 Lineage table (for data flow tracking)
CREATE TABLE IF NOT EXISTS public.flow_v2_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.flow_v2_runs(id) ON DELETE CASCADE,
  to_node_id text NOT NULL,
  edge_id text NOT NULL,
  target_path text NOT NULL,
  from_node_id text NOT NULL,
  expr text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS flow_v2_lineage_run_id_idx ON public.flow_v2_lineage(run_id);
CREATE INDEX IF NOT EXISTS flow_v2_lineage_target_idx ON public.flow_v2_lineage(run_id, to_node_id, target_path);

-- Enable RLS on flow_v2_lineage
ALTER TABLE public.flow_v2_lineage ENABLE ROW LEVEL SECURITY;

-- RLS policies for flow_v2_lineage (inherit from run access)
DO $$ BEGIN
  CREATE POLICY "flow_v2_lineage_select_policy" ON public.flow_v2_lineage FOR SELECT
    USING (
      run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        WHERE fd.owner_id = auth.uid()
      )
      OR run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "flow_v2_lineage_insert_policy" ON public.flow_v2_lineage FOR INSERT
    WITH CHECK (
      run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        WHERE fd.owner_id = auth.uid()
      )
      OR run_id IN (
        SELECT r.id FROM public.flow_v2_runs r
        JOIN public.flow_v2_definitions fd ON r.flow_id = fd.id
        JOIN public.workspace_members wm ON fd.workspace_id = wm.workspace_id
        WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin', 'editor')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
