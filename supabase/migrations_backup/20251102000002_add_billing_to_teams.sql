-- Add billing fields to teams table
-- This allows standalone teams to function like "mini organizations" with their own task quotas

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS tasks_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tasks_limit INTEGER DEFAULT 10000;

-- Add comments explaining the columns
COMMENT ON COLUMN teams.tasks_used IS 'Number of workflow tasks executed this billing period for this team';
COMMENT ON COLUMN teams.tasks_limit IS 'Maximum number of workflow tasks allowed per billing period for this team';

-- Create index for faster lookups when checking quota
CREATE INDEX IF NOT EXISTS idx_teams_tasks_quota ON teams(tasks_used, tasks_limit);

-- Update existing teams to have default limits
UPDATE teams
SET tasks_limit = 10000
WHERE tasks_limit IS NULL;
