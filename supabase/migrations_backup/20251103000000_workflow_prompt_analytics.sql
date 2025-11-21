-- Workflow Prompt Analytics and Dynamic Template Learning
-- Created: November 3, 2025
-- Purpose: Track user prompts, template usage, and auto-generate templates

-- =============================================================================
-- Add admin column to user_profiles if it doesn't exist
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'admin'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN admin BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- =============================================================================
-- Table: workflow_prompts
-- Purpose: Track every user prompt to identify patterns
-- =============================================================================
CREATE TABLE IF NOT EXISTS workflow_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,

  -- Prompt details
  prompt TEXT NOT NULL,
  normalized_prompt TEXT NOT NULL, -- Lowercase, trimmed for pattern matching

  -- Template usage
  template_id VARCHAR(100), -- If matched a template (e.g., "email-to-slack")
  used_template BOOLEAN NOT NULL DEFAULT false,
  template_source VARCHAR(50), -- 'built_in' or 'dynamic'

  -- LLM usage
  used_llm BOOLEAN NOT NULL DEFAULT false,
  llm_cost DECIMAL(10, 4) DEFAULT 0.0, -- Track actual cost

  -- Provider context
  detected_provider VARCHAR(100), -- Auto-selected or user-selected provider
  provider_category VARCHAR(100), -- email, calendar, etc.

  -- Plan details
  plan_nodes INTEGER, -- Number of nodes in generated plan
  plan_complexity VARCHAR(50), -- simple, medium, complex

  -- Success tracking
  plan_generated BOOLEAN NOT NULL DEFAULT false,
  plan_built BOOLEAN NOT NULL DEFAULT false, -- Did user actually build it?
  plan_executed BOOLEAN NOT NULL DEFAULT false, -- Did user execute the workflow?

  -- User feedback
  user_satisfaction INTEGER, -- 1-5 rating (if we add feedback)
  regenerated BOOLEAN DEFAULT false, -- Did user click "regenerate"?

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_user_id ON workflow_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_template_id ON workflow_prompts(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_created_at ON workflow_prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_normalized ON workflow_prompts(normalized_prompt);
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_used_template ON workflow_prompts(used_template);

-- Full-text search on prompts
CREATE INDEX IF NOT EXISTS idx_workflow_prompts_prompt_fts ON workflow_prompts USING gin(to_tsvector('english', prompt));

-- RLS Policies
ALTER TABLE workflow_prompts ENABLE ROW LEVEL SECURITY;

-- Users can view their own prompts
CREATE POLICY "Users can view own prompts"
  ON workflow_prompts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own prompts
CREATE POLICY "Users can insert own prompts"
  ON workflow_prompts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own prompts (for feedback)
CREATE POLICY "Users can update own prompts"
  ON workflow_prompts FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all prompts (for analytics)
CREATE POLICY "Admins can view all prompts"
  ON workflow_prompts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );


-- =============================================================================
-- Table: template_analytics
-- Purpose: Track performance of each template (built-in + dynamic)
-- =============================================================================
CREATE TABLE IF NOT EXISTS template_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_id VARCHAR(100) NOT NULL UNIQUE, -- "email-to-slack", etc.
  template_source VARCHAR(50) NOT NULL, -- 'built_in' or 'dynamic'

  -- Usage stats
  total_uses INTEGER NOT NULL DEFAULT 0,
  successful_uses INTEGER NOT NULL DEFAULT 0,
  failed_uses INTEGER NOT NULL DEFAULT 0,
  regeneration_requests INTEGER NOT NULL DEFAULT 0,

  -- Success rate (computed)
  success_rate DECIMAL(5, 2) DEFAULT 0.0, -- Percentage

  -- User satisfaction
  avg_satisfaction DECIMAL(3, 2), -- 1.00 to 5.00
  satisfaction_count INTEGER DEFAULT 0,

  -- Execution stats
  plans_built INTEGER NOT NULL DEFAULT 0, -- How many users built the workflow
  plans_executed INTEGER NOT NULL DEFAULT 0, -- How many users executed it

  -- Cost savings
  total_cost_saved DECIMAL(10, 4) DEFAULT 0.0, -- Total $ saved vs LLM

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  -- Template is active/disabled
  is_active BOOLEAN NOT NULL DEFAULT true,
  disabled_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_template_analytics_template_id ON template_analytics(template_id);
CREATE INDEX IF NOT EXISTS idx_template_analytics_success_rate ON template_analytics(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_template_analytics_total_uses ON template_analytics(total_uses DESC);

-- RLS Policies
ALTER TABLE template_analytics ENABLE ROW LEVEL SECURITY;

-- Everyone can view template analytics (read-only)
CREATE POLICY "Anyone can view template analytics"
  ON template_analytics FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can modify template analytics"
  ON template_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );


-- =============================================================================
-- Table: dynamic_templates
-- Purpose: Store auto-generated templates from user behavior
-- =============================================================================
CREATE TABLE IF NOT EXISTS dynamic_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_id VARCHAR(100) NOT NULL UNIQUE, -- Auto-generated ID
  template_name TEXT NOT NULL,

  -- Pattern matching
  patterns JSONB NOT NULL, -- Array of regex patterns
  example_prompts TEXT[], -- Example prompts that match this pattern

  -- Template plan
  plan JSONB NOT NULL, -- The workflow plan (nodes + connections)

  -- Provider configuration
  requires_provider BOOLEAN NOT NULL DEFAULT false,
  provider_category VARCHAR(100), -- email, calendar, etc.
  supported_providers TEXT[], -- ['gmail', 'outlook']

  -- Generation context
  generated_from_prompts UUID[], -- Array of workflow_prompts.id that contributed
  source_llm_responses INTEGER, -- How many LLM responses used to create this

  -- Quality metrics
  confidence_score DECIMAL(5, 2) DEFAULT 0.0, -- 0.00 to 100.00
  min_similarity INTEGER DEFAULT 5, -- Minimum similar prompts before creating

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT false, -- Must be validated before activating
  is_validated BOOLEAN NOT NULL DEFAULT false,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dynamic_templates_template_id ON dynamic_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_templates_is_active ON dynamic_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_dynamic_templates_created_at ON dynamic_templates(created_at DESC);

-- RLS Policies
ALTER TABLE dynamic_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view active templates
CREATE POLICY "Anyone can view active dynamic templates"
  ON dynamic_templates FOR SELECT
  USING (is_active = true);

-- Admins can view all templates
CREATE POLICY "Admins can view all dynamic templates"
  ON dynamic_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );

-- Only admins can insert/update/delete
CREATE POLICY "Admins can modify dynamic templates"
  ON dynamic_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );


-- =============================================================================
-- Table: prompt_clusters
-- Purpose: Group similar prompts together to identify template opportunities
-- =============================================================================
CREATE TABLE IF NOT EXISTS prompt_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cluster identification
  cluster_name VARCHAR(200) NOT NULL,
  cluster_key TEXT NOT NULL, -- Normalized key for grouping

  -- Member prompts
  prompt_ids UUID[] NOT NULL, -- Array of workflow_prompts.id
  prompt_count INTEGER NOT NULL DEFAULT 0,

  -- Pattern analysis
  common_keywords TEXT[], -- Frequently appearing words
  common_providers TEXT[], -- Frequently selected providers
  avg_node_count DECIMAL(5, 2), -- Average complexity

  -- Template generation
  template_candidate BOOLEAN DEFAULT false,
  template_id VARCHAR(100), -- If template was generated
  generated_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_cluster_key ON prompt_clusters(cluster_key);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_template_candidate ON prompt_clusters(template_candidate);
CREATE INDEX IF NOT EXISTS idx_prompt_clusters_prompt_count ON prompt_clusters(prompt_count DESC);

-- RLS Policies
ALTER TABLE prompt_clusters ENABLE ROW LEVEL SECURITY;

-- Admins only
CREATE POLICY "Admins can view prompt clusters"
  ON prompt_clusters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );

CREATE POLICY "Admins can modify prompt clusters"
  ON prompt_clusters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.admin = true
    )
  );


-- =============================================================================
-- Functions: Helper functions for analytics
-- =============================================================================

-- Function: Update template analytics when a prompt is logged
CREATE OR REPLACE FUNCTION update_template_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- If a template was used, update its analytics
  IF NEW.template_id IS NOT NULL THEN
    INSERT INTO template_analytics (
      template_id,
      template_source,
      total_uses,
      successful_uses,
      plans_built,
      plans_executed,
      total_cost_saved,
      last_used_at
    ) VALUES (
      NEW.template_id,
      COALESCE(NEW.template_source, 'built_in'),
      1,
      CASE WHEN NEW.plan_generated THEN 1 ELSE 0 END,
      CASE WHEN NEW.plan_built THEN 1 ELSE 0 END,
      CASE WHEN NEW.plan_executed THEN 1 ELSE 0 END,
      CASE WHEN NEW.used_template THEN 0.03 ELSE 0.0 END,
      NOW()
    )
    ON CONFLICT (template_id) DO UPDATE SET
      total_uses = template_analytics.total_uses + 1,
      successful_uses = template_analytics.successful_uses + CASE WHEN NEW.plan_generated THEN 1 ELSE 0 END,
      failed_uses = template_analytics.failed_uses + CASE WHEN NOT NEW.plan_generated THEN 1 ELSE 0 END,
      plans_built = template_analytics.plans_built + CASE WHEN NEW.plan_built THEN 1 ELSE 0 END,
      plans_executed = template_analytics.plans_executed + CASE WHEN NEW.plan_executed THEN 1 ELSE 0 END,
      regeneration_requests = template_analytics.regeneration_requests + CASE WHEN NEW.regenerated THEN 1 ELSE 0 END,
      total_cost_saved = template_analytics.total_cost_saved + CASE WHEN NEW.used_template THEN 0.03 ELSE 0.0 END,
      success_rate = ROUND((template_analytics.successful_uses + CASE WHEN NEW.plan_generated THEN 1 ELSE 0 END)::DECIMAL / (template_analytics.total_uses + 1) * 100, 2),
      last_used_at = NOW(),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update template analytics
DROP TRIGGER IF EXISTS trigger_update_template_analytics ON workflow_prompts;
CREATE TRIGGER trigger_update_template_analytics
  AFTER INSERT OR UPDATE ON workflow_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_template_analytics();


-- =============================================================================
-- Views: Useful analytics views
-- =============================================================================

-- View: Template performance leaderboard
CREATE OR REPLACE VIEW template_performance AS
SELECT
  template_id,
  template_source,
  total_uses,
  success_rate,
  plans_built,
  plans_executed,
  total_cost_saved,
  ROUND((plans_executed::DECIMAL / NULLIF(plans_built, 0) * 100), 2) as execution_rate,
  last_used_at
FROM template_analytics
WHERE is_active = true
ORDER BY total_uses DESC;

-- View: Top prompt patterns (template candidates)
CREATE OR REPLACE VIEW template_candidates AS
SELECT
  normalized_prompt,
  COUNT(*) as frequency,
  ARRAY_AGG(DISTINCT detected_provider) as providers_used,
  AVG(plan_nodes) as avg_complexity,
  SUM(CASE WHEN plan_built THEN 1 ELSE 0 END) as build_count,
  MAX(created_at) as last_seen
FROM workflow_prompts
WHERE used_template = false
  AND plan_generated = true
GROUP BY normalized_prompt
HAVING COUNT(*) >= 3
ORDER BY frequency DESC
LIMIT 50;

-- View: Daily cost savings
CREATE OR REPLACE VIEW daily_cost_savings AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_prompts,
  SUM(CASE WHEN used_template THEN 1 ELSE 0 END) as template_uses,
  SUM(CASE WHEN used_llm THEN 1 ELSE 0 END) as llm_uses,
  ROUND(SUM(CASE WHEN used_template THEN 0.03 ELSE 0.0 END), 2) as cost_saved,
  ROUND(SUM(llm_cost), 2) as llm_cost_spent,
  ROUND(
    (SUM(CASE WHEN used_template THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100),
    2
  ) as template_hit_rate
FROM workflow_prompts
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;


-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE workflow_prompts IS 'Tracks every user prompt for pattern analysis and template generation';
COMMENT ON TABLE template_analytics IS 'Performance metrics for all templates (built-in + dynamic)';
COMMENT ON TABLE dynamic_templates IS 'Auto-generated templates based on user behavior patterns';
COMMENT ON TABLE prompt_clusters IS 'Groups similar prompts to identify template opportunities';

COMMENT ON VIEW template_performance IS 'Leaderboard of template performance metrics';
COMMENT ON VIEW template_candidates IS 'Top prompt patterns that should become templates';
COMMENT ON VIEW daily_cost_savings IS 'Daily breakdown of template vs LLM usage and cost savings';
