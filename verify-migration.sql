-- ================================================================
-- VERIFICATION QUERIES FOR WORKSPACE INTEGRATION MIGRATION
-- Run these in Supabase SQL Editor after migration
-- ================================================================

-- 1. Check that workspace columns were added to integrations
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'integrations'
  AND column_name IN ('workspace_type', 'workspace_id', 'connected_by')
ORDER BY column_name;

-- Expected: 3 rows (workspace_type, workspace_id, connected_by)

-- ================================================================

-- 2. Check workspace_type distribution
SELECT
    workspace_type,
    COUNT(*) as count
FROM integrations
GROUP BY workspace_type
ORDER BY count DESC;

-- Expected: All should be 'personal' after backfill

-- ================================================================

-- 3. Check that integration_permissions table exists
SELECT
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'integration_permissions';

-- Expected: 1 row

-- ================================================================

-- 4. Check permission distribution
SELECT
    permission,
    COUNT(*) as count
FROM integration_permissions
GROUP BY permission
ORDER BY permission;

-- Expected: All should be 'admin' after backfill

-- ================================================================

-- 5. Verify all integrations have admin permissions for their owners
SELECT
    i.id,
    i.provider,
    i.user_id as owner_id,
    i.workspace_type,
    ip.permission,
    ip.user_id as permission_user_id,
    CASE
        WHEN ip.permission = 'admin' AND ip.user_id = i.user_id THEN '✓ Correct'
        ELSE '✗ Missing admin permission'
    END as status
FROM integrations i
LEFT JOIN integration_permissions ip
    ON i.id = ip.integration_id
    AND i.user_id = ip.user_id
WHERE i.workspace_type = 'personal'
ORDER BY status DESC, i.provider;

-- Expected: All should show '✓ Correct'

-- ================================================================

-- 6. Check that SQL helper functions were created
SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name IN (
    'get_user_integration_permission',
    'can_user_use_integration',
    'can_user_manage_integration',
    'can_user_admin_integration',
    'get_integration_admins'
)
ORDER BY routine_name;

-- Expected: 5 rows (all 5 functions)

-- ================================================================

-- 7. Test a helper function (replace with your user_id and integration_id)
-- SELECT get_user_integration_permission(
--     'YOUR_USER_ID'::uuid,
--     'YOUR_INTEGRATION_ID'::uuid
-- );

-- Expected: 'admin' for your own integrations

-- ================================================================

-- 8. Check RLS policies on integration_permissions
SELECT
    policyname,
    tablename,
    cmd
FROM pg_policies
WHERE tablename = 'integration_permissions'
ORDER BY policyname;

-- Expected: 4 policies (view own, grant, update, revoke)

-- ================================================================

-- 9. Final summary
SELECT
    'Total Integrations' as metric,
    COUNT(*)::text as value
FROM integrations
UNION ALL
SELECT
    'Personal Integrations',
    COUNT(*)::text
FROM integrations
WHERE workspace_type = 'personal'
UNION ALL
SELECT
    'Total Permissions',
    COUNT(*)::text
FROM integration_permissions
UNION ALL
SELECT
    'Admin Permissions',
    COUNT(*)::text
FROM integration_permissions
WHERE permission = 'admin'
UNION ALL
SELECT
    'Helper Functions',
    COUNT(*)::text
FROM information_schema.routines
WHERE routine_name LIKE 'can_user_%' OR routine_name LIKE 'get_%integration%';

-- Expected: All counts should match (all integrations should have admin permissions)
