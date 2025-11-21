-- Add default workspace fields to user_profiles table
-- This stores the user's preferred workspace for creating new workflows

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS default_workspace_type TEXT CHECK (default_workspace_type IN ('personal', 'team', 'organization')),
ADD COLUMN IF NOT EXISTS default_workspace_id UUID,
ADD COLUMN IF NOT EXISTS workflow_creation_mode TEXT DEFAULT 'ask' CHECK (workflow_creation_mode IN ('default', 'ask', 'follow_switcher'));

-- Add comment explaining the columns
COMMENT ON COLUMN user_profiles.default_workspace_type IS 'User''s preferred workspace type for creating new workflows (personal, team, or organization)';
COMMENT ON COLUMN user_profiles.default_workspace_id IS 'The ID of the team or organization for the default workspace (null for personal)';
COMMENT ON COLUMN user_profiles.workflow_creation_mode IS 'How to handle workflow creation: default (use default_workspace), ask (always show selector), follow_switcher (use current workspace switcher selection)';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_default_workspace ON user_profiles(default_workspace_type, default_workspace_id);
