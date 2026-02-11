-- Create workflow comments table for collaboration
CREATE TABLE IF NOT EXISTS public.workflow_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    node_id TEXT, -- Optional: if NULL, comment is on workflow level; if set, comment is on specific node
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ, -- For marking comments as resolved
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES public.workflow_comments(id) ON DELETE CASCADE, -- For replies/threads

    -- User display info (denormalized for performance)
    user_email TEXT,
    user_name TEXT
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflow_comments_workflow_id ON public.workflow_comments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_node_id ON public.workflow_comments(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_user_id ON public.workflow_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_parent_id ON public.workflow_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_created_at ON public.workflow_comments(created_at DESC);

-- Enable RLS
ALTER TABLE public.workflow_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view comments on their own workflows
CREATE POLICY "Users can view workflow comments"
    ON public.workflow_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_comments.workflow_id
            AND w.user_id = auth.uid()
        )
    );

-- Policy: Users can create comments on their own workflows
CREATE POLICY "Users can create workflow comments"
    ON public.workflow_comments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_comments.workflow_id
            AND w.user_id = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Policy: Users can update their own comments
CREATE POLICY "Users can update own comments"
    ON public.workflow_comments
    FOR UPDATE
    USING (user_id = auth.uid());

-- Policy: Users can delete their own comments OR comments on their workflows
CREATE POLICY "Users can delete comments"
    ON public.workflow_comments
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_comments.workflow_id
            AND w.user_id = auth.uid()
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_comment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS workflow_comment_updated_at ON public.workflow_comments;
CREATE TRIGGER workflow_comment_updated_at
    BEFORE UPDATE ON public.workflow_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_comment_updated_at();

-- Comment on table
COMMENT ON TABLE public.workflow_comments IS 'Stores comments and notes on workflows and individual nodes for collaboration';
