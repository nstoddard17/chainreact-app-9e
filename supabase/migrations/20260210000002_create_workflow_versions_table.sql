-- Create workflow versions table for version history
CREATE TABLE IF NOT EXISTS public.workflow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    change_summary TEXT,
    is_published BOOLEAN DEFAULT false,
    nodes_count INTEGER DEFAULT 0,

    -- Store the full workflow state at this version
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    connections JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Track changes from previous version
    changes JSONB DEFAULT NULL, -- { added: number, modified: number, removed: number }

    -- Workflow metadata at this version
    name TEXT,
    description TEXT,
    status TEXT DEFAULT 'draft',

    UNIQUE(workflow_id, version_number)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON public.workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created_at ON public.workflow_versions(created_at DESC);

-- Enable RLS
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view versions of workflows they own
CREATE POLICY "Users can view workflow versions"
    ON public.workflow_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_versions.workflow_id
            AND w.user_id = auth.uid()
        )
    );

-- Policy: Users can create versions for their own workflows
CREATE POLICY "Users can create workflow versions"
    ON public.workflow_versions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_versions.workflow_id
            AND w.user_id = auth.uid()
        )
    );

-- Policy: Users can delete versions of their own workflows
CREATE POLICY "Users can delete workflow versions"
    ON public.workflow_versions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_versions.workflow_id
            AND w.user_id = auth.uid()
        )
    );

-- Comment on table
COMMENT ON TABLE public.workflow_versions IS 'Stores version history for workflows, allowing users to restore previous versions';

-- Function to auto-create version on workflow update
CREATE OR REPLACE FUNCTION create_workflow_version()
RETURNS TRIGGER AS $$
DECLARE
    next_version INTEGER;
    node_changes JSONB;
    old_node_ids TEXT[];
    new_node_ids TEXT[];
    added_count INTEGER;
    removed_count INTEGER;
    modified_count INTEGER;
BEGIN
    -- Only create version if nodes or connections changed
    IF OLD.nodes IS DISTINCT FROM NEW.nodes OR OLD.connections IS DISTINCT FROM NEW.connections THEN
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
        FROM public.workflow_versions
        WHERE workflow_id = NEW.id;

        -- Calculate changes (simplified)
        SELECT array_agg(n->>'id') INTO old_node_ids FROM jsonb_array_elements(COALESCE(OLD.nodes, '[]'::jsonb)) n;
        SELECT array_agg(n->>'id') INTO new_node_ids FROM jsonb_array_elements(COALESCE(NEW.nodes, '[]'::jsonb)) n;

        -- Count added (in new but not in old)
        SELECT COUNT(*) INTO added_count FROM unnest(new_node_ids) nid WHERE nid != ALL(COALESCE(old_node_ids, ARRAY[]::TEXT[]));

        -- Count removed (in old but not in new)
        SELECT COUNT(*) INTO removed_count FROM unnest(old_node_ids) oid WHERE oid != ALL(COALESCE(new_node_ids, ARRAY[]::TEXT[]));

        -- Count modified (in both, but we'll assume config changes for nodes that exist in both)
        modified_count := 0; -- Simplified, would need deeper comparison

        node_changes := jsonb_build_object(
            'added', added_count,
            'removed', removed_count,
            'modified', modified_count
        );

        -- Insert version record with OLD state (before the change)
        INSERT INTO public.workflow_versions (
            workflow_id,
            version_number,
            created_by,
            nodes_count,
            nodes,
            connections,
            changes,
            name,
            description,
            status
        ) VALUES (
            NEW.id,
            next_version,
            NEW.last_modified_by,
            jsonb_array_length(COALESCE(OLD.nodes, '[]'::jsonb)),
            COALESCE(OLD.nodes, '[]'::jsonb),
            COALESCE(OLD.connections, '[]'::jsonb),
            node_changes,
            OLD.name,
            OLD.description,
            OLD.status
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-versioning
DROP TRIGGER IF EXISTS workflow_auto_version ON public.workflows;
CREATE TRIGGER workflow_auto_version
    AFTER UPDATE ON public.workflows
    FOR EACH ROW
    EXECUTE FUNCTION create_workflow_version();
