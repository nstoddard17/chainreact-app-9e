-- Create workflow_execution_history table
CREATE TABLE IF NOT EXISTS public.workflow_execution_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  test_mode BOOLEAN DEFAULT false,
  input_data JSONB,
  output_data JSONB,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_workflow_execution_history_workflow_id ON public.workflow_execution_history(workflow_id);
CREATE INDEX idx_workflow_execution_history_user_id ON public.workflow_execution_history(user_id);
CREATE INDEX idx_workflow_execution_history_execution_id ON public.workflow_execution_history(execution_id);
CREATE INDEX idx_workflow_execution_history_status ON public.workflow_execution_history(status);
CREATE INDEX idx_workflow_execution_history_started_at ON public.workflow_execution_history(started_at);

-- Enable Row Level Security
ALTER TABLE public.workflow_execution_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (drop if exist first)

-- Users can view their own execution history
DROP POLICY IF EXISTS "Users can view own execution history" ON public.workflow_execution_history;
CREATE POLICY "Users can view own execution history"
  ON public.workflow_execution_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own execution history
DROP POLICY IF EXISTS "Users can insert own execution history" ON public.workflow_execution_history;
CREATE POLICY "Users can insert own execution history"
  ON public.workflow_execution_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own execution history
DROP POLICY IF EXISTS "Users can update own execution history" ON public.workflow_execution_history;
CREATE POLICY "Users can update own execution history"
  ON public.workflow_execution_history FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own execution history
DROP POLICY IF EXISTS "Users can delete own execution history" ON public.workflow_execution_history;
CREATE POLICY "Users can delete own execution history"
  ON public.workflow_execution_history FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do anything (for webhook executions)
DROP POLICY IF EXISTS "Service role full access" ON public.workflow_execution_history;
CREATE POLICY "Service role full access"
  ON public.workflow_execution_history
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflow_execution_history_updated_at
  BEFORE UPDATE ON public.workflow_execution_history
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();