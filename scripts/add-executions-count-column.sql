-- Add executions_count column to workflows table
-- This column tracks the number of times a workflow has been executed

ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS executions_count INTEGER DEFAULT 0;

-- Add comment to the column
COMMENT ON COLUMN workflows.executions_count IS 'Number of times this workflow has been executed';

-- Create an index for performance when sorting/filtering by execution count
CREATE INDEX IF NOT EXISTS idx_workflows_executions_count ON workflows(executions_count);

-- Update any existing workflows to have 0 executions if NULL
UPDATE workflows 
SET executions_count = 0 
WHERE executions_count IS NULL;