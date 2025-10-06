-- Ensure execution_progress table exists (if migration 20251005130921 wasn't applied)
CREATE TABLE IF NOT EXISTS execution_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_execution_sessions(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  current_node_id TEXT,
  current_node_name TEXT,
  completed_nodes JSONB DEFAULT '[]'::jsonb,
  pending_nodes JSONB DEFAULT '[]'::jsonb,
  failed_nodes JSONB DEFAULT '[]'::jsonb,
  node_outputs JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  progress_percentage INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_execution_progress_execution ON execution_progress(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow ON execution_progress(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(execution_id, status);

-- Enable RLS if not already enabled
ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'execution_progress'
        AND policyname = 'Users can view their own execution progress'
    ) THEN
        CREATE POLICY "Users can view their own execution progress"
            ON execution_progress FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'execution_progress'
        AND policyname = 'Users can create their own execution progress'
    ) THEN
        CREATE POLICY "Users can create their own execution progress"
            ON execution_progress FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'execution_progress'
        AND policyname = 'Users can update their own execution progress'
    ) THEN
        CREATE POLICY "Users can update their own execution progress"
            ON execution_progress FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'execution_progress'
        AND policyname = 'Users can delete their own execution progress'
    ) THEN
        CREATE POLICY "Users can delete their own execution progress"
            ON execution_progress FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_execution_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS execution_progress_updated_at ON execution_progress;
CREATE TRIGGER execution_progress_updated_at
  BEFORE UPDATE ON execution_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_execution_progress_updated_at();