-- Create table for tracking AI workflow creation costs
-- This tracks when users create workflows via AI and how many tasks were deducted

CREATE TABLE IF NOT EXISTS public.ai_workflow_cost_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flow_id UUID NOT NULL,
    tasks_used INTEGER NOT NULL DEFAULT 1,
    node_count INTEGER NOT NULL DEFAULT 0,
    planning_method TEXT NOT NULL DEFAULT 'llm',
    breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_workflow_cost_logs_user_id ON public.ai_workflow_cost_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_cost_logs_created_at ON public.ai_workflow_cost_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_cost_logs_flow_id ON public.ai_workflow_cost_logs(flow_id);

-- Enable RLS
ALTER TABLE public.ai_workflow_cost_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Users can view their own cost logs
DROP POLICY IF EXISTS "Users can view own cost logs" ON public.ai_workflow_cost_logs;
CREATE POLICY "Users can view own cost logs" ON public.ai_workflow_cost_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- Only the system (service role) can insert cost logs
-- This is handled by the admin client in the API

-- Add comment explaining the table
COMMENT ON TABLE public.ai_workflow_cost_logs IS 'Tracks AI workflow creation costs for task/credit deduction';
COMMENT ON COLUMN public.ai_workflow_cost_logs.tasks_used IS 'Number of tasks deducted for this workflow creation';
COMMENT ON COLUMN public.ai_workflow_cost_logs.node_count IS 'Number of nodes generated in the workflow';
COMMENT ON COLUMN public.ai_workflow_cost_logs.planning_method IS 'Method used: llm, pattern, or cache';
COMMENT ON COLUMN public.ai_workflow_cost_logs.breakdown IS 'JSON breakdown of cost components: base and complexity';
