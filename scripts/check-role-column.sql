-- Check if role column exists in user_profiles table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
  AND column_name = 'role';

-- Check current user_profiles data
SELECT 
  id,
  full_name,
  username,
  provider,
  role,
  created_at,
  updated_at
FROM user_profiles 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if there are any users without roles
SELECT 
  COUNT(*) as users_without_role
FROM user_profiles 
WHERE role IS NULL;

-- Check role distribution
SELECT 
  role,
  COUNT(*) as user_count
FROM user_profiles 
GROUP BY role 
ORDER BY user_count DESC; 