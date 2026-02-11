-- Add tags column to workflows table
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create index for faster tag lookups
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON public.workflows USING GIN (tags);

-- Create a table for managing user-defined tag colors (optional but nice UX)
CREATE TABLE IF NOT EXISTS public.workflow_tag_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'gray', -- Color options: gray, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, tag_name)
);

-- Enable RLS
ALTER TABLE public.workflow_tag_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_tag_settings
CREATE POLICY "Users can view their own tag settings"
    ON public.workflow_tag_settings
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tag settings"
    ON public.workflow_tag_settings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tag settings"
    ON public.workflow_tag_settings
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tag settings"
    ON public.workflow_tag_settings
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_workflow_tag_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_tag_settings_updated_at
    BEFORE UPDATE ON public.workflow_tag_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_tag_settings_updated_at();

-- Comment on table
COMMENT ON TABLE public.workflow_tag_settings IS 'User-defined tag colors for workflow organization';
COMMENT ON COLUMN public.workflows.tags IS 'Array of user-defined tags for workflow organization';
