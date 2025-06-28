-- Test script to verify user_profiles RLS policies work correctly
-- This should be run in the Supabase SQL editor

-- First, let's check the current RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.tablename = 'user_profiles';

-- Check if there are any existing profiles
SELECT 
  id,
  full_name,
  username,
  role,
  created_at
FROM user_profiles 
LIMIT 5;

-- Test that the table structure is correct
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Note: To test the actual RLS policies, you would need to:
-- 1. Sign in as a user in your application
-- 2. Try to access their profile data
-- 3. Verify that they can only see their own profile
-- 4. Verify that they cannot see other users' profiles

-- The RLS policies should allow:
-- - Users to SELECT their own profile (WHERE auth.uid() = id)
-- - Users to UPDATE their own profile (WHERE auth.uid() = id)  
-- - Users to INSERT their own profile (WITH CHECK auth.uid() = id) 