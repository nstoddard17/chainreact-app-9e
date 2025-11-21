-- Add deleted_at column for soft delete (trash) functionality
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient trash queries
CREATE INDEX IF NOT EXISTS idx_workflows_deleted_at ON workflows(deleted_at) WHERE deleted_at IS NOT NULL;
