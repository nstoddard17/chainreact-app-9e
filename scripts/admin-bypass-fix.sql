-- Fix admin access using a function approach
-- This should be more reliable than complex RLS policies

-- First, let's reset to the basic working policy
DROP POLICY IF EXISTS "Enable read access for users to their own profile or admin to all" ON user_profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;

-- Create the basic policy that was working before
CREATE POLICY "Enable read access for users to their own profile" ON user_profiles
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

-- Test the functions
SELECT is_admin(); -- Should return true for admin users

-- Show current policies
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