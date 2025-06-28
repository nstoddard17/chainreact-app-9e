-- Simple fix for admin access without breaking regular profile access
-- This uses a more reliable approach

-- First, let's see current policies
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

-- Drop the problematic policy
DROP POLICY IF EXISTS "Enable read access for users to their own profile or admin to all" ON user_profiles;

-- Create a simple policy for regular users
CREATE POLICY "Users can read their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Create a separate policy for admin access
CREATE POLICY "Admins can read all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Test the regular user query (should work)
SELECT 
  id, 
  full_name, 
  username, 
  role
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Show final policies
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