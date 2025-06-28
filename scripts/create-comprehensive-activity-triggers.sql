-- Create comprehensive activity tracking using database triggers
-- This will update last_seen_at for ALL user interactions

-- Function to update last_seen_at automatically
CREATE OR REPLACE FUNCTION update_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_seen_at for the user who performed the action
    UPDATE user_profiles 
    SET last_seen_at = NOW()
    WHERE id = auth.uid();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for SELECT queries (reading data)
CREATE OR REPLACE FUNCTION update_user_activity_select()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_seen_at for the user who performed the action
    UPDATE user_profiles 
    SET last_seen_at = NOW()
    WHERE id = auth.uid();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers on key tables that indicate user activity

-- Workflows table (INSERT, UPDATE, DELETE)
DROP TRIGGER IF EXISTS trigger_update_activity_workflows ON workflows;
CREATE TRIGGER trigger_update_activity_workflows
    AFTER INSERT OR UPDATE OR DELETE ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity();

-- Workflows table (SELECT - reading workflows)
DROP TRIGGER IF EXISTS trigger_update_activity_workflows_select ON workflows;
CREATE TRIGGER trigger_update_activity_workflows_select
    AFTER SELECT ON workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_select();

-- Integrations table (INSERT, UPDATE, DELETE)
DROP TRIGGER IF EXISTS trigger_update_activity_integrations ON integrations;
CREATE TRIGGER trigger_update_activity_integrations
    AFTER INSERT OR UPDATE OR DELETE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity();

-- Integrations table (SELECT - viewing integrations)
DROP TRIGGER IF EXISTS trigger_update_activity_integrations_select ON integrations;
CREATE TRIGGER trigger_update_activity_integrations_select
    AFTER SELECT ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_select();

-- Workflow executions table (INSERT, UPDATE, DELETE)
DROP TRIGGER IF EXISTS trigger_update_activity_workflow_executions ON workflow_executions;
CREATE TRIGGER trigger_update_activity_workflow_executions
    AFTER INSERT OR UPDATE OR DELETE ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity();

-- Workflow executions table (SELECT - viewing executions)
DROP TRIGGER IF EXISTS trigger_update_activity_workflow_executions_select ON workflow_executions;
CREATE TRIGGER trigger_update_activity_workflow_executions_select
    AFTER SELECT ON workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_select();

-- User profiles table (UPDATE)
DROP TRIGGER IF EXISTS trigger_update_activity_user_profiles ON user_profiles;
CREATE TRIGGER trigger_update_activity_user_profiles
    AFTER UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity();

-- User profiles table (SELECT - viewing profiles)
DROP TRIGGER IF EXISTS trigger_update_activity_user_profiles_select ON user_profiles;
CREATE TRIGGER trigger_update_activity_user_profiles_select
    AFTER SELECT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_select();

-- Email frequency cache table (any operation)
DROP TRIGGER IF EXISTS trigger_update_activity_email_cache ON email_frequency_cache;
CREATE TRIGGER trigger_update_activity_email_cache
    AFTER INSERT OR UPDATE OR DELETE OR SELECT ON email_frequency_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity();

-- Verify triggers were created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name LIKE '%update_activity%'
ORDER BY trigger_name; 