-- Create workflow_files table for storing temporary file attachments
CREATE TABLE IF NOT EXISTS workflow_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workflow_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT check_file_size CHECK (file_size > 0 AND file_size <= 26214400) -- 25MB limit
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workflow_files_user_id ON workflow_files(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_files_expires_at ON workflow_files(expires_at);
CREATE INDEX IF NOT EXISTS idx_workflow_files_workflow_id ON workflow_files(workflow_id);

-- Enable Row Level Security
ALTER TABLE workflow_files ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access only their own files
CREATE POLICY "Users can manage their own workflow files" ON workflow_files
    FOR ALL USING (auth.uid() = user_id);

-- Create storage bucket for workflow files
INSERT INTO storage.buckets (id, name, public)
VALUES ('workflow-files', 'workflow-files', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for workflow files
CREATE POLICY "Users can upload workflow files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'workflow-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their workflow files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'workflow-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their workflow files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'workflow-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Comment the table
COMMENT ON TABLE workflow_files IS 'Stores metadata for temporary file attachments used in workflows';
COMMENT ON COLUMN workflow_files.expires_at IS 'Files are automatically cleaned up after this timestamp';
COMMENT ON COLUMN workflow_files.file_path IS 'Path to the file in storage bucket';
COMMENT ON COLUMN workflow_files.workflow_id IS 'Optional workflow ID for grouping files'; 