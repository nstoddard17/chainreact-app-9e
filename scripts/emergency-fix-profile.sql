-- Emergency fix for profile access issues
-- This will temporarily disable RLS and then recreate proper policies

-- Step 1: Temporarily disable RLS to test if that's the issue
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Step 2: Test if we can now access the profile
-- (This should work now)
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

-- Step 3: Re-enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admin can update any user role" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile and admin can view all" ON user_profiles;
DROP POLICY IF EXISTS "Only admin can update user roles" ON user_profiles;

-- Step 5: Create basic, working policies
CREATE POLICY "Enable read access for users to their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Enable update access for users to their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Enable insert access for users to their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Step 6: Test the query again with RLS enabled
-- This should now work
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

-- Step 7: Show current policies
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