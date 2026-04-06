-- Add notification_preferences JSONB column to user_profiles
-- Stores user notification settings: email, slack, workflow_success, workflow_failure, weekly_digest
-- Also stores slack_notification config: team_name, channel_id, channel_name, access_token (encrypted)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"email": false, "slack": false, "workflow_success": true, "workflow_failure": true, "weekly_digest": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS slack_notification_config jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.notification_preferences IS 'User notification toggle preferences';
COMMENT ON COLUMN user_profiles.slack_notification_config IS 'Slack notification connection config: team_name, channel_id, channel_name, bot_token, team_id';
