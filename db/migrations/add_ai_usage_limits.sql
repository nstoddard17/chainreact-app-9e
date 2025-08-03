-- Add AI usage tracking to monthly_usage table
ALTER TABLE monthly_usage 
ADD COLUMN IF NOT EXISTS ai_assistant_calls INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_compose_uses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_agent_executions INTEGER DEFAULT 0;

-- Add AI limits to plans table
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS max_ai_assistant_calls INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_ai_compose_uses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_ai_agent_executions INTEGER DEFAULT 0;

-- Update existing plans with AI limits
UPDATE plans SET 
  max_ai_assistant_calls = 5,
  max_ai_compose_uses = 5,
  max_ai_agent_executions = 5
WHERE name = 'Free';

UPDATE plans SET 
  max_ai_assistant_calls = 20,
  max_ai_compose_uses = 20,
  max_ai_agent_executions = 20
WHERE name = 'Pro';

UPDATE plans SET 
  max_ai_assistant_calls = 20,
  max_ai_compose_uses = 20,
  max_ai_agent_executions = 20
WHERE name = 'Beta-Pro';

UPDATE plans SET 
  max_ai_assistant_calls = 100,
  max_ai_compose_uses = 100,
  max_ai_agent_executions = 100
WHERE name = 'Business';

UPDATE plans SET 
  max_ai_assistant_calls = 100,
  max_ai_compose_uses = 100,
  max_ai_agent_executions = 100
WHERE name = 'Enterprise';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_calls ON monthly_usage(user_id, year, month, ai_assistant_calls);
CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_compose ON monthly_usage(user_id, year, month, ai_compose_uses);
CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_agent ON monthly_usage(user_id, year, month, ai_agent_executions); 