-- Comprehensive fix for all users with Google identities but wrong provider values
-- This script will update user_profiles.provider to 'google' for all users who have Google identities

-- First, let's see what we have
SELECT 
  up.id,
  up.full_name,
  up.provider as current_provider,
  au.email,
  au.identities
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE au.identities IS NOT NULL 
  AND au.identities::text LIKE '%google%'
ORDER BY up.updated_at DESC;

-- Update all users with Google identities to have 'google' provider
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE au.identities IS NOT NULL 
    AND au.identities::text LIKE '%google%'
)
AND (provider IS NULL OR provider != 'google');

-- Also ensure email users have correct provider
UPDATE user_profiles 
SET 
  provider = 'email',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE (au.identities IS NULL OR au.identities::text NOT LIKE '%google%')
    AND au.email IS NOT NULL
)
AND (provider IS NULL OR provider != 'email');

-- Show final state
SELECT 
  up.id,
  up.full_name,
  up.provider,
  au.email,
  au.identities
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
ORDER BY up.updated_at DESC;

-- Show provider distribution
SELECT 
  provider,
  COUNT(*) as user_count
FROM user_profiles 
GROUP BY provider
ORDER BY user_count DESC; 