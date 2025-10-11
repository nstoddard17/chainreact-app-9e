-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates the execution_progress table needed for Live Test Mode

-- Create the table
CREATE TABLE IF NOT EXISTS public.execution_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT NOT NULL,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_execution_progress_execution ON execution_progress(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow ON execution_progress(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(execution_id, status);

-- Enable Row Level Security
ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own execution progress"
  ON execution_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own execution progress"
  ON execution_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own execution progress"
  ON execution_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own execution progress"
  ON execution_progress FOR DELETE
  USING (auth.uid() = user_id);

-- Create service role policies (for the execution engine)
CREATE POLICY "Service role can manage all execution progress"
  ON execution_progress FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_execution_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS execution_progress_updated_at ON execution_progress;
CREATE TRIGGER execution_progress_updated_at
  BEFORE UPDATE ON execution_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_execution_progress_updated_at();

-- Verify the table was created
SELECT 'Table created successfully!' as message;