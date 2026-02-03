-- Add columns for AI-generated template tracking
-- These columns help identify and deduplicate templates created by the AI planner

-- Add prompt_hash for deduplication (hash of normalized prompt)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS prompt_hash TEXT;

-- Add is_ai_generated flag to distinguish from manually created templates
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- Add original_prompt to store the user's original request
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS original_prompt TEXT;

-- Add integrations array to track required integrations
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS integrations TEXT[] DEFAULT '{}';

-- Add tags array for categorization and search
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add nodes and connections columns if they don't exist
-- (Some templates use workflow_json, others use separate nodes/connections)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS nodes JSONB;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS connections JSONB;

-- Add status column for draft/published workflow
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Add is_predefined for system templates
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS is_predefined BOOLEAN DEFAULT FALSE;

-- Add published_at timestamp
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Add difficulty and estimated_time for UI display
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS difficulty TEXT;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS estimated_time TEXT;

-- Create index on prompt_hash for fast lookup
CREATE INDEX IF NOT EXISTS idx_templates_prompt_hash
ON templates(prompt_hash)
WHERE prompt_hash IS NOT NULL;

-- Create index on is_ai_generated for filtering
CREATE INDEX IF NOT EXISTS idx_templates_ai_generated
ON templates(is_ai_generated)
WHERE is_ai_generated = TRUE;

-- Create index on integrations for filtering by required integrations
CREATE INDEX IF NOT EXISTS idx_templates_integrations
ON templates USING GIN(integrations);

-- Create index on tags for search
CREATE INDEX IF NOT EXISTS idx_templates_tags
ON templates USING GIN(tags);

-- Add comment explaining the AI template system
COMMENT ON COLUMN templates.prompt_hash IS 'SHA-256 hash (first 16 chars) of normalized prompt for deduplication';
COMMENT ON COLUMN templates.is_ai_generated IS 'True if template was automatically created by AI planner';
COMMENT ON COLUMN templates.original_prompt IS 'Original user prompt that generated this template';
COMMENT ON COLUMN templates.integrations IS 'Array of required integration provider IDs (e.g., gmail, slack)';
COMMENT ON COLUMN templates.tags IS 'Array of tags for categorization and search';
