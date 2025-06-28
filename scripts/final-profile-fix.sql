-- Final fix for profile access
-- This ensures profile access works reliably

-- First, let's disable RLS temporarily to test profile access
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Test that profile access works now
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Now let's create a very simple RLS policy
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Enable read access for users to their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Enable read access for users to their own profile or admin to all" ON user_profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;

-- Create the simplest possible policy
CREATE POLICY "Enable read access for users to their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Test the policy works
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Create admin function for getting all users
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  username TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Check if user is admin by bypassing RLS
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
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

-- Show final configuration
SELECT 
  t.schemaname,
  t.tablename,
  t.rowsecurity,
  p.policyname
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.tablename = 'user_profiles'; 