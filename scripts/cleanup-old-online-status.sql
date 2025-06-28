-- Cleanup script to remove old online status tracking
-- This removes the last_seen_at column and related triggers

-- Remove the last_seen_at column from user_profiles if it exists
ALTER TABLE user_profiles DROP COLUMN IF EXISTS last_seen_at;

-- Drop any remaining activity tracking triggers
DROP TRIGGER IF EXISTS trigger_update_activity_workflows ON workflows;
DROP TRIGGER IF EXISTS trigger_update_activity_workflows_select ON workflows;
DROP TRIGGER IF EXISTS trigger_update_activity_integrations ON integrations;
DROP TRIGGER IF EXISTS trigger_update_activity_integrations_select ON integrations;
DROP TRIGGER IF EXISTS trigger_update_activity_workflow_executions ON workflow_executions;
DROP TRIGGER IF EXISTS trigger_update_activity_workflow_executions_select ON workflow_executions;
DROP TRIGGER IF EXISTS trigger_update_activity_user_profiles ON user_profiles;

-- Drop the activity tracking functions
DROP FUNCTION IF EXISTS update_user_activity();
DROP FUNCTION IF EXISTS update_user_activity_select();

-- Remove RLS policies related to last_seen_at
DROP POLICY IF EXISTS "Users can update their own last_seen_at" ON user_profiles;

-- Verify cleanup
SELECT 
  'Tables' as object_type,
  table_name,
  column_name
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'last_seen_at';

SELECT 
  'Triggers' as object_type,
  trigger_name
FROM information_schema.triggers 
WHERE trigger_name LIKE '%update_activity%';

SELECT 
  'Functions' as object_type,
  routine_name
FROM information_schema.routines 
WHERE routine_name LIKE '%update_user_activity%'; 