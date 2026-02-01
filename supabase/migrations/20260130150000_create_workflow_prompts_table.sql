-- Create workflow_prompts table for prompt analytics
-- Tracks user prompts, template usage, and identifies template opportunities

CREATE TABLE IF NOT EXISTS public.workflow_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  normalized_prompt TEXT NOT NULL,
  template_id TEXT,
  used_template BOOLEAN NOT NULL DEFAULT FALSE,
  template_source TEXT CHECK (template_source IN ('built_in', 'dynamic')),
  used_llm BOOLEAN NOT NULL DEFAULT FALSE,
  llm_cost NUMERIC(10, 4) DEFAULT 0.0,
  detected_provider TEXT,
  provider_category TEXT,
  plan_nodes INTEGER,
  plan_complexity TEXT CHECK (plan_complexity IN ('simple', 'medium', 'complex')),
  plan_generated BOOLEAN NOT NULL DEFAULT FALSE,
  plan_built BOOLEAN DEFAULT FALSE,
  plan_executed BOOLEAN DEFAULT FALSE,
  user_satisfaction INTEGER CHECK (user_satisfaction >= 1 AND user_satisfaction <= 5),
  regenerated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_user_id ON public.workflow_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_workflow_id ON public.workflow_prompts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_normalized ON public.workflow_prompts(normalized_prompt);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_used_template ON public.workflow_prompts(used_template);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_created_at ON public.workflow_prompts(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_template_id ON public.workflow_prompts(template_id);

-- Full text search index for similar prompt matching
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_prompt_fts
  ON public.workflow_prompts
  USING gin(to_tsvector('english', prompt));

-- Enable RLS
ALTER TABLE public.workflow_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see and manage their own prompts
CREATE POLICY "Users can view their own prompts"
  ON public.workflow_prompts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prompts"
  ON public.workflow_prompts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompts"
  ON public.workflow_prompts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_workflow_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_workflow_prompts_updated_at
  BEFORE UPDATE ON public.workflow_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_workflow_prompts_updated_at();

-- Drop existing objects if they exist (may be tables from old migrations)
DROP TABLE IF EXISTS public.template_candidates CASCADE;
DROP TABLE IF EXISTS public.template_performance CASCADE;
DROP TABLE IF EXISTS public.daily_cost_savings CASCADE;
DROP VIEW IF EXISTS public.template_candidates CASCADE;
DROP VIEW IF EXISTS public.template_performance CASCADE;
DROP VIEW IF EXISTS public.daily_cost_savings CASCADE;

-- View: Template candidates (prompts that appear frequently without a template)
CREATE VIEW public.template_candidates AS
SELECT
  normalized_prompt,
  COUNT(*) as frequency,
  ARRAY_AGG(DISTINCT detected_provider) FILTER (WHERE detected_provider IS NOT NULL) as providers_used,
  AVG(plan_nodes)::NUMERIC(5,2) as avg_complexity,
  COUNT(*) FILTER (WHERE plan_built = TRUE) as build_count,
  MAX(created_at) as last_seen
FROM public.workflow_prompts
WHERE used_template = FALSE
GROUP BY normalized_prompt
HAVING COUNT(*) >= 2
ORDER BY frequency DESC;

-- View: Template performance metrics
CREATE VIEW public.template_performance AS
SELECT
  template_id,
  template_source,
  COUNT(*) as total_uses,
  (COUNT(*) FILTER (WHERE plan_generated = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as success_rate,
  COUNT(*) FILTER (WHERE plan_built = TRUE) as plans_built,
  COUNT(*) FILTER (WHERE plan_executed = TRUE) as plans_executed,
  (COUNT(*) * 0.03)::NUMERIC(10,2) as total_cost_saved,
  (COUNT(*) FILTER (WHERE plan_executed = TRUE)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE plan_built = TRUE), 0) * 100)::NUMERIC(5,2) as execution_rate,
  MAX(created_at) as last_used_at
FROM public.workflow_prompts
WHERE used_template = TRUE AND template_id IS NOT NULL
GROUP BY template_id, template_source
ORDER BY total_uses DESC;

-- View: Daily cost savings summary
CREATE VIEW public.daily_cost_savings AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_prompts,
  COUNT(*) FILTER (WHERE used_template = TRUE) as template_uses,
  COUNT(*) FILTER (WHERE used_llm = TRUE) as llm_uses,
  (COUNT(*) FILTER (WHERE used_template = TRUE) * 0.03)::NUMERIC(10,2) as cost_saved,
  COALESCE(SUM(llm_cost), 0)::NUMERIC(10,2) as llm_cost_spent,
  (COUNT(*) FILTER (WHERE used_template = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as template_hit_rate
FROM public.workflow_prompts
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.workflow_prompts TO authenticated;
GRANT SELECT ON public.template_candidates TO authenticated;
GRANT SELECT ON public.template_performance TO authenticated;
GRANT SELECT ON public.daily_cost_savings TO authenticated;

-- Comment
COMMENT ON TABLE public.workflow_prompts IS 'Stores user prompts for workflow AI agent, tracking template usage and LLM costs';
