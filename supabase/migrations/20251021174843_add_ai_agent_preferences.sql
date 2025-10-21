-- Add AI agent preference fields to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS ai_agent_preference TEXT DEFAULT 'always_show' CHECK (ai_agent_preference IN ('always_show', 'always_skip', 'ask_later')),
ADD COLUMN IF NOT EXISTS ai_agent_skip_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_agent_preference_updated_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.ai_agent_preference IS 'User preference for AI agent workflow creation: always_show (default), always_skip, or ask_later';
COMMENT ON COLUMN user_profiles.ai_agent_skip_count IS 'Number of times user has skipped AI agent since last preference update';
COMMENT ON COLUMN user_profiles.ai_agent_preference_updated_at IS 'Timestamp of last AI agent preference update';
