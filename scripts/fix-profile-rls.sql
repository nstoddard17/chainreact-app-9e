-- Fix RLS policies for user_profiles table
-- This addresses the 500 Internal Server Error when fetching profiles

-- First, let's see what policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'user_profiles';

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view their own profile and admin can view all" ON user_profiles;
DROP POLICY IF EXISTS "Only admin can update user roles" ON user_profiles;

-- Create simpler, more reliable RLS policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create a separate policy for admin role management (only for role updates)
CREATE POLICY "Admin can update any user role" ON user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Verify the policies
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

-- Test the query that was failing
-- This should work now
SELECT 
  id, 
  first_name, 
  last_name, 
  full_name, 
  company, 
  job_title, 
  username, 
  secondary_email, 
  phone_number, 
  avatar_url, 
  provider, 
  role, 
  created_at, 
  updated_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'; 