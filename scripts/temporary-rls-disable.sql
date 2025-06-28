-- TEMPORARY WORKAROUND: Disable RLS to get the app working
-- WARNING: This disables security temporarily - only use for debugging!

-- Disable RLS temporarily
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'user_profiles';

-- Test that we can now access the table
SELECT COUNT(*) FROM user_profiles;

-- IMPORTANT: After testing that the app works, run the following to re-enable RLS properly:
/*
-- Re-enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create proper policies
CREATE POLICY "Users can manage their own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- Verify policies are working
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
*/ 