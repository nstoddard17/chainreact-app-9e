-- Add role column to user_profiles table
-- This column will define user roles: free, pro, business, enterprise, admin

-- Add role column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN role VARCHAR(20) DEFAULT 'free' CHECK (role IN ('free', 'pro', 'business', 'enterprise', 'admin'));
  END IF;
END
$$;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.role IS 'User role defining access level and privileges';

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Update existing users to have appropriate roles
-- Set admin role for existing users who should have admin privileges
UPDATE user_profiles 
SET role = 'admin' 
WHERE username IN ('nstoddard17', 'DaBoss');

-- Set default role for all other users
UPDATE user_profiles 
SET role = 'free' 
WHERE role IS NULL OR role NOT IN ('admin');

-- Create a function to check user role permissions
CREATE OR REPLACE FUNCTION check_user_role_permission(
  user_id UUID,
  required_role VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  user_role VARCHAR(20);
BEGIN
  -- Get user's role
  SELECT role INTO user_role
  FROM user_profiles
  WHERE id = user_id;
  
  -- If user not found, deny access
  IF user_role IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Admin has access to everything
  IF user_role = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Check role hierarchy
  CASE required_role
    WHEN 'free' THEN
      RETURN user_role IN ('free', 'pro', 'business', 'enterprise');
    WHEN 'pro' THEN
      RETURN user_role IN ('pro', 'business', 'enterprise');
    WHEN 'business' THEN
      RETURN user_role IN ('business', 'enterprise');
    WHEN 'enterprise' THEN
      RETURN user_role = 'enterprise';
    WHEN 'admin' THEN
      RETURN user_role = 'admin';
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policy for role-based access
CREATE POLICY "Users can view their own profile and admin can view all" ON user_profiles
  FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create policy for role updates (only admin can update roles)
CREATE POLICY "Only admin can update user roles" ON user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  ); 