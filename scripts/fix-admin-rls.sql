-- Fix RLS policies to allow admin users to view all profiles
-- This is needed for the admin panel to work properly

-- First, let's see what policies exist
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

-- Drop the current read policy
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;

-- Create a new policy that allows users to read their own profile OR allows admins to read all profiles
CREATE POLICY "Enable read access for users to their own profile or admin to all" ON user_profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Verify the new policy
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

-- Test the query as an admin user
-- This should now return all users
SELECT 
  id, 
  full_name, 
  username, 
  role, 
  created_at
FROM user_profiles 
ORDER BY created_at DESC; 