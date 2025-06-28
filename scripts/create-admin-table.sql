-- Create a separate admin table for admin panel functionality
-- This keeps user_profiles secure while providing admin access

-- Create the admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT,
  role TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to read all records
CREATE POLICY "Admins can read all admin_users" ON admin_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create policy for users to read their own record
CREATE POLICY "Users can read their own admin_users record" ON admin_users
  FOR SELECT USING (auth.uid() = id);

-- Create a function to sync data from user_profiles to admin_users
CREATE OR REPLACE FUNCTION sync_to_admin_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update the admin_users table
  INSERT INTO admin_users (id, full_name, username, role, created_at, updated_at)
  VALUES (NEW.id, NEW.full_name, NEW.username, NEW.role, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) 
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically sync changes
DROP TRIGGER IF EXISTS sync_admin_users_trigger ON user_profiles;
CREATE TRIGGER sync_admin_users_trigger
  AFTER INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_to_admin_users();

-- Populate admin_users with existing data
INSERT INTO admin_users (id, full_name, username, role, created_at, updated_at)
SELECT id, full_name, username, role, created_at, updated_at
FROM user_profiles
ON CONFLICT (id) 
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- Test the setup
SELECT 
  id, 
  full_name, 
  username, 
  role,
  created_at
FROM admin_users 
ORDER BY created_at DESC;

-- Show the policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('user_profiles', 'admin_users')
ORDER BY tablename, policyname; 