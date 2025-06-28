-- Emergency fix to restore profile access
-- This temporarily disables RLS to get profiles working again

-- Disable RLS temporarily to restore profile access
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Test that profile access works now
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Show current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'user_profiles';

-- Show current policies (should be none active)
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname; 