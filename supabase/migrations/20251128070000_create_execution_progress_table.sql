-- Add missing columns to execution_progress table for tracking workflow execution progress
-- This table is used by ExecutionProgressTracker to provide real-time execution status

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add workflow_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'workflow_id') THEN
        ALTER TABLE execution_progress ADD COLUMN workflow_id UUID;
    END IF;

    -- Add user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'user_id') THEN
        ALTER TABLE execution_progress ADD COLUMN user_id UUID;
    END IF;

    -- Add status if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'status') THEN
        ALTER TABLE execution_progress ADD COLUMN status TEXT DEFAULT 'running';
    END IF;

    -- Add current_node_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'current_node_id') THEN
        ALTER TABLE execution_progress ADD COLUMN current_node_id TEXT;
    END IF;

    -- Add current_node_name if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'current_node_name') THEN
        ALTER TABLE execution_progress ADD COLUMN current_node_name TEXT;
    END IF;

    -- Add completed_nodes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'completed_nodes') THEN
        ALTER TABLE execution_progress ADD COLUMN completed_nodes TEXT[] DEFAULT '{}';
    END IF;

    -- Add pending_nodes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'pending_nodes') THEN
        ALTER TABLE execution_progress ADD COLUMN pending_nodes TEXT[] DEFAULT '{}';
    END IF;

    -- Add failed_nodes if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'failed_nodes') THEN
        ALTER TABLE execution_progress ADD COLUMN failed_nodes JSONB DEFAULT '[]';
    END IF;

    -- Add node_outputs if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'node_outputs') THEN
        ALTER TABLE execution_progress ADD COLUMN node_outputs JSONB DEFAULT '{}';
    END IF;

    -- Add progress_percentage if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'progress_percentage') THEN
        ALTER TABLE execution_progress ADD COLUMN progress_percentage INTEGER DEFAULT 0;
    END IF;

    -- Add error_message if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'error_message') THEN
        ALTER TABLE execution_progress ADD COLUMN error_message TEXT;
    END IF;

    -- Add started_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'started_at') THEN
        ALTER TABLE execution_progress ADD COLUMN started_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'updated_at') THEN
        ALTER TABLE execution_progress ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add completed_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'completed_at') THEN
        ALTER TABLE execution_progress ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes if they don't exist (only for columns that exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'workflow_id') THEN
        CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow_id ON execution_progress(workflow_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_execution_progress_user_id ON execution_progress(user_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'execution_progress' AND column_name = 'status') THEN
        CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(status);
    END IF;
END $$;

-- Enable RLS (idempotent)
ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they're correct
DROP POLICY IF EXISTS "Users can view their own execution progress" ON execution_progress;
DROP POLICY IF EXISTS "Service role can manage execution progress" ON execution_progress;

-- Policy for users to view their own execution progress
CREATE POLICY "Users can view their own execution progress"
    ON execution_progress
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy for service role to insert/update
CREATE POLICY "Service role can manage execution progress"
    ON execution_progress
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant access
GRANT ALL ON execution_progress TO service_role;
GRANT SELECT ON execution_progress TO authenticated;
