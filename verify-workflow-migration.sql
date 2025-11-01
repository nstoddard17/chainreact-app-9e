-- Verify workflow workspace migration

-- Check 1: Verify workspace_type column was added
SELECT
  'workspace_type column exists' as check_name,
  COUNT(*) > 0 as passed
FROM information_schema.columns
WHERE table_name = 'workflows'
  AND column_name = 'workspace_type';

-- Check 2: Verify workflow_permissions table was created
SELECT
  'workflow_permissions table exists' as check_name,
  COUNT(*) > 0 as passed
FROM information_schema.tables
WHERE table_name = 'workflow_permissions';

-- Check 3: Count workflows by workspace_type
SELECT
  'Workflows by workspace type' as metric,
  workspace_type,
  COUNT(*) as count
FROM workflows
GROUP BY workspace_type;

-- Check 4: Count workflow permissions
SELECT
  'Total workflow permissions' as metric,
  COUNT(*) as count
FROM workflow_permissions;

-- Check 5: Permission breakdown
SELECT
  'Permissions by level' as metric,
  permission,
  COUNT(*) as count
FROM workflow_permissions
GROUP BY permission;

-- Check 6: Helper functions created
SELECT
  'Helper functions' as check_name,
  COUNT(*) as count
FROM pg_proc
WHERE proname IN (
  'user_has_workflow_permission',
  'grant_workflow_permission',
  'revoke_workflow_permission',
  'get_user_workflow_permission'
);

-- Check 7: Sample workflows with permissions
SELECT
  w.id,
  w.name,
  w.workspace_type,
  w.user_id,
  w.created_by,
  wp.permission
FROM workflows w
LEFT JOIN workflow_permissions wp ON w.id = wp.workflow_id
LIMIT 5;
