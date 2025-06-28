-- Cleanup script to remove the admin_users table and related objects
-- Since we're fixing RLS policies directly on user_profiles instead

-- Drop the trigger first
DROP TRIGGER IF EXISTS sync_admin_users_trigger ON user_profiles;

-- Drop the sync function
DROP FUNCTION IF EXISTS sync_to_admin_users();

-- Drop the admin_users table
DROP TABLE IF EXISTS admin_users;

-- Drop the get_all_users function if it exists
DROP FUNCTION IF EXISTS get_all_users();

-- Drop the is_admin function if it exists
DROP FUNCTION IF EXISTS is_admin();

-- Verify cleanup
SELECT 
  t.schemaname,
  t.tablename,
  p.policyname
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.tablename IN ('user_profiles', 'admin_users')
ORDER BY t.tablename, p.policyname; 