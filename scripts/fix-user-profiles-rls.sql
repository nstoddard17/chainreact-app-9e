-- Fix user_profiles RLS policies to work with upsert operations
-- This ensures users can create and read their own profiles

-- Enable RLS if not already enabled
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable update access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable insert access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile and admin can view all" ON user_profiles;
DROP POLICY IF EXISTS "Only admin can update user roles" ON user_profiles;

-- Create comprehensive policies that work with upsert operations
CREATE POLICY "Users can read their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Verify the policies are created correctly
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

-- Test that a user can access their own profile (this will be run by the application)
-- The auth.uid() function will return the current user's ID when called from the app 