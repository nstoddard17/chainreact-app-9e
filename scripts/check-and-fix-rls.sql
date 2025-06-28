-- Check current RLS status and fix user_profiles access
-- This will ensure profile fetching works while keeping admin functionality

-- First, let's see what's currently configured
SELECT 
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.tablename = 'user_profiles';

-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable read access for users to their own profile or admin to all" ON user_profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;

-- Create a simple, working policy for user_profiles
CREATE POLICY "Users can read their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Create policy for users to update their own profile
CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create policy for users to insert their own profile
CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Test that the policy works
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Show final configuration
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