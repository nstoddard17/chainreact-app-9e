-- Simple RLS fix for user_profiles table
-- This creates more permissive policies that should work better

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable update access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile and admin can view all" ON user_profiles;
DROP POLICY IF EXISTS "Only admin can update user roles" ON user_profiles;

-- Create a single comprehensive policy that allows all operations for own profile
CREATE POLICY "Users can manage their own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- Alternative: If the above doesn't work, try this more permissive approach
-- CREATE POLICY "Allow authenticated users to manage profiles" ON user_profiles
--   FOR ALL USING (auth.role() = 'authenticated');

-- Verify the policy was created
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

-- Test query to see if we can access the table
-- This should work if the policy is set up correctly
SELECT COUNT(*) FROM user_profiles; 