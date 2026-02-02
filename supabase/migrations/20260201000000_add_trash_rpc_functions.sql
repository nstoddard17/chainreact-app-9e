-- Add RPC functions for trash management
-- These functions are called by the workflow store to manage soft deletion

-- Move a workflow to trash (soft delete)
CREATE OR REPLACE FUNCTION move_workflow_to_trash(workflow_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE workflows
  SET deleted_at = NOW(),
      updated_at = NOW()
  WHERE id = workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restore a workflow from trash
CREATE OR REPLACE FUNCTION restore_workflow_from_trash(workflow_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE workflows
  SET deleted_at = NULL,
      updated_at = NOW()
  WHERE id = workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Empty user's trash (permanently delete all trashed workflows)
CREATE OR REPLACE FUNCTION empty_user_trash(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- First delete associated workflow nodes
  DELETE FROM workflow_nodes
  WHERE workflow_id IN (
    SELECT id FROM workflows
    WHERE user_id = user_uuid AND deleted_at IS NOT NULL
  );

  -- Then delete associated workflow edges
  DELETE FROM workflow_edges
  WHERE workflow_id IN (
    SELECT id FROM workflows
    WHERE user_id = user_uuid AND deleted_at IS NOT NULL
  );

  -- Delete workflow permissions
  DELETE FROM workflow_permissions
  WHERE workflow_id IN (
    SELECT id FROM workflows
    WHERE user_id = user_uuid AND deleted_at IS NOT NULL
  );

  -- Delete workflow executions
  DELETE FROM workflow_executions
  WHERE workflow_id IN (
    SELECT id FROM workflows
    WHERE user_id = user_uuid AND deleted_at IS NOT NULL
  );

  -- Finally, permanently delete the workflows
  DELETE FROM workflows
  WHERE user_id = user_uuid AND deleted_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION move_workflow_to_trash(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_workflow_from_trash(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION empty_user_trash(UUID) TO authenticated;
