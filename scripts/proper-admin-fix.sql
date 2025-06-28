-- Proper fix for admin access without breaking profile functionality
-- This re-enables RLS with a simple policy and uses functions for admin access

-- First, let's re-enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable read access for users to their own profile or admin to all" ON user_profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;

-- Create a simple, reliable policy for users to read their own profile
CREATE POLICY "Users can read their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Create a function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get all users (admin only)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;
  
  -- Return all users
  RETURN QUERY
  SELECT 
    up.id,
    up.full_name,
    up.username,
    up.role,
    up.created_at
  FROM user_profiles up
  ORDER BY up.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test that regular profile access still works
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Test the admin function
SELECT is_admin(); -- Should return true for admin users

-- Show final configuration
SELECT 
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  p.policyname
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.tablename = 'user_profiles'; 